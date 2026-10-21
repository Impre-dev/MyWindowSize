// ==UserScript==
// @name           MyWindowSize
// @version        1.1.0
// @description    Force la géométrie de la fenêtre (x, y, largeur, hauteur) à chaque lancement — neutralise la restauration SessionStore.
// @author         Impre
// @include        main
// ==/UserScript==

(function () {
  'use strict';

  // Pref au format "x,y,w,h" (outer window, CSS pixels de la fenêtre).
  // Modifiable dans about:config sans toucher au code.
  // Valeurs par défaut relevées au Window Spy (outer) : 281,103 — 1358x835.
  const PREF = 'MyWindowSize.geometry';
  const DEFAULT = '281,103,1358,835';

  if (window.__myWindowSize) return;
  window.__myWindowSize = true;

  // --- Neutralisation ------------------------------------------------------
  // SessionStore.#restoreDimensions() (SessionStore.sys.mjs) restaure la
  // TAILLE via window.resizeTo() → no-op ci-dessous.
  // ⚠️ Depuis Firefox récent (base Zen actuelle), la POSITION n'emprunte plus
  // moveTo() mais getBaseWindow(aWindow).setPositionDesktopPix() (nsIBaseWindow,
  // objet C++ non monkey-patchable). La position ne peut donc pas être
  // neutralisée par patch : on la RÉAFFIRME après la restauration, sur
  // l'event fenêtre SSWindowRestored — dispatché à la résolution du promise
  // de #restoreWindowFeatures, donc strictement APRÈS #restoreDimensions.
  const origResizeTo = window.resizeTo.bind(window);
  const origMoveTo = window.moveTo.bind(window);
  window.resizeTo = () => {};
  window.moveTo = () => {};

  let applied = false;
  // SSWindowRestoring est dispatché au DÉBUT de #restoreWindow : tant qu'une
  // restauration est pending, on ne pose pas la géométrie au load (elle
  // serait immédiatement écrasée par le setTimeout(0) qui appelle
  // #restoreDimensions) → c'était le "ping pong" de la 1.0.
  let restorePending = false;

  function getGeometry() {
    const raw = Services.prefs.getStringPref(PREF, DEFAULT) || DEFAULT;
    const parts = raw.split(',').map((v) => parseInt(v.trim(), 10));
    if (parts.length !== 4 || parts.some(Number.isNaN)) {
      console.warn(`[MyWindowSize] pref ${PREF} invalide ("${raw}"), format attendu "x,y,w,h"`);
      return null;
    }
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }

  // Application de la géométrie fixe (sans garde — l'unicité est gérée
  // par les appelants via applied / restorePending).
  function force() {
    // resizeTo/moveTo natifs sont ignorés tant que la fenêtre est maximized /
    // minimized / fullscreen → sizemodechange prendra le relais au premier
    // retour en état normal (ex: démaximisation).
    if (window.windowState !== window.STATE_NORMAL) return;
    const g = getGeometry();
    if (!g || g.w <= 0 || g.h <= 0) return;

    origResizeTo(g.w, g.h);
    origMoveTo(g.x, g.y);
    applied = true;
    cleanup();
    console.log(`[MyWindowSize] géométrie appliquée : (${g.x}, ${g.y}) ${g.w}x${g.h}`);
  }

  // Application unique : saute si déjà fait ou si une restauration
  // SessionStore est en cours (SSWindowRestored prendra le relais).
  function applyOnce() {
    if (applied || restorePending) return;
    force();
  }

  function cleanup() {
    window.removeEventListener('SSWindowRestoring', onWindowRestoring);
    window.removeEventListener('SSWindowRestored', onWindowRestored);
    window.removeEventListener('sizemodechange', onSizeModeChange);
    Services.obs.removeObserver(onWindowsRestored, 'sessionstore-windows-restored');
  }

  function onWindowRestoring() {
    restorePending = true;
  }

  function onWindowRestored() {
    // #restoreDimensions vient de tourner (position remise à celle de
    // fermeture) → on réaffirme la géométrie voulue. Couvre TOUS les chemins
    // de restauration : startup, réouverture de fenêtre fermée, restoreWindow.
    restorePending = false;
    force();
  }

  function onSizeModeChange() {
    applyOnce();
  }

  // Backstop startup : notification globale tirée après TOUS les
  // #restoreDimensions (et après chaque SSWindowRestored). Ne sert que si
  // SSWindowRestored a été manqué (injection tardive du script).
  function onWindowsRestored() {
    restorePending = false;
    applyOnce();
  }

  window.addEventListener('SSWindowRestoring', onWindowRestoring);
  window.addEventListener('SSWindowRestored', onWindowRestored);

  // Réappliquer au premier retour en normal si le startup s'est fait en
  // maximized (resizeTo/moveTo natifs y sont ignorés).
  window.addEventListener('sizemodechange', onSizeModeChange);

  // sessionstore-windows-restored est notifié dans TOUS les cas, avec ou
  // sans session à restaurer (SessionStore.sys.mjs, NOTIFY_WINDOWS_RESTORED)
  // → point de synchronisation garanti, sans timer.
  Services.obs.addObserver(onWindowsRestored, 'sessionstore-windows-restored');

  // Application la plus précoce possible (cas sans restauration SessionStore).
  if (document.readyState === 'complete') {
    applyOnce();
  } else {
    window.addEventListener('load', () => applyOnce(), { once: true });
  }
})();
