// ==UserScript==
// @name           MyWindowSize
// @version        1.0.0
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
  // SessionStore.restoreDimensions() (SessionStore.sys.mjs) restaure la
  // géométrie de la session en appelant window.resizeTo() / window.moveTo().
  // On les remplace par des no-op : toute tentative de restauration
  // (startup, session de crash, etc.) tombe dans le vide.
  // NOTE : le drag natif à la souris ne passe PAS par ces APIs JS → aucun
  // impact sur le redimensionnement manuel.
  const origResizeTo = window.resizeTo.bind(window);
  const origMoveTo = window.moveTo.bind(window);
  window.resizeTo = () => {};
  window.moveTo = () => {};

  let applied = false;

  function getGeometry() {
    const raw = Services.prefs.getStringPref(PREF, DEFAULT) || DEFAULT;
    const parts = raw.split(',').map((v) => parseInt(v.trim(), 10));
    if (parts.length !== 4 || parts.some(Number.isNaN)) {
      console.warn(`[MyWindowSize] pref ${PREF} invalide ("${raw}"), format attendu "x,y,w,h"`);
      return null;
    }
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }

  // Application unique de la géométrie fixe (une fois par fenêtre).
  function apply() {
    if (applied) return;
    // resizeTo/moveTo sont ignorés tant que la fenêtre est maximized /
    // minimized / fullscreen → sizemodechange prendra le relais au
    // premier retour en état normal (ex: démaximisation).
    if (window.windowState !== window.STATE_NORMAL) return;
    const g = getGeometry();
    if (!g || g.w <= 0 || g.h <= 0) return;

    origResizeTo(g.w, g.h);
    origMoveTo(g.x, g.y);
    applied = true;
    cleanup();
    console.log(`[MyWindowSize] géométrie appliquée : (${g.x}, ${g.y}) ${g.w}x${g.h}`);
  }

  function cleanup() {
    window.removeEventListener('sizemodechange', onSizeModeChange);
    Services.obs.removeObserver(onWindowsRestored, 'sessionstore-windows-restored');
  }

  function onSizeModeChange() {
    apply();
  }

  function onWindowsRestored() {
    apply();
  }

  // Réappliquer les valeurs au premier retour en normal si le startup
  // s'est fait en maximized (resizeTo y est ignoré).
  window.addEventListener('sizemodechange', onSizeModeChange);

  // sessionstore-windows-restored est notifié dans TOUS les cas, avec ou
  // sans session à restaurer (SessionStore.sys.mjs, NOTIFY_WINDOWS_RESTORED)
  // → point de synchronisation garanti, sans timer.
  Services.obs.addObserver(onWindowsRestored, 'sessionstore-windows-restored');

  // Application la plus précoce possible : dès que le document est complet.
  if (document.readyState === 'complete') {
    apply();
  } else {
    window.addEventListener('load', () => apply(), { once: true });
  }
})();
