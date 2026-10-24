// ==UserScript==
// @name           MyWindowSize
// @version        1.2.0
// @description    Force la géométrie de la fenêtre (x, y, largeur, hauteur) à chaque lancement — neutralise la restauration SessionStore.
// @author         Impre
// @include        main
// ==/UserScript==

(function () {
  'use strict';

  // Pref au format "x,y,w,h" (outer window, CSS pixels de la fenêtre).
  // Modifiable dans about:config sans toucher au code.
  // 1400x1000 (1405x976 relevés au Window Spy, arrondis à la cinquantaine)
  // centré dans la zone de travail (écran 1920x1080, taskbar 40px → 1040) :
  // x=(1920-1400)/2=260, y=(1040-1000)/2=20 → 20px au-dessus de la taskbar.
  const PREF = 'MyWindowSize.geometry';
  const DEFAULT = '260,20,1400,1000';

  if (window.__myWindowSize) return;
  window.__myWindowSize = true;

  // --- Neutralisation ------------------------------------------------------
  // SessionStore.#restoreDimensions() (SessionStore.sys.mjs) restaure la
  // géométrie de session :
  //   - TAILLE    : window.resizeTo()       → no-op ci-dessous
  //   - POSITION  : getBaseWindow(aWindow)
  //                 .setPositionDesktopPix() (nsIBaseWindow C++ — NON
  //                 patchable depuis le JS ; voir leçon roadmap)
  //   - SIZEMODE  : window.maximize()       → no-op ci-dessous
  //
  // La position ne peut pas être neutralisée : on la RÉAFFIRME sur
  // SSWindowRestored (dispatché à la résolution du promise de
  // #restoreWindowFeatures, donc APRÈS #restoreDimensions — chaque passe de
  // restauration, quelle qu'en soit l'origine, finit par cet event).
  // La maximisation de session, elle, est neutralisable : les seuls
  // appelants JS de window.maximize() dans tout le build sont les 2 lignes
  // de #restoreDimensions — le maximize manuel (titlebar, Win+Up) passe par
  // le natif et n'est pas affecté.
  //
  // ⚠️ Les listeners ne sont JAMAIS retirés : la restauration peut passer
  // APRÈS notre premier apply (injection Sine tardive, session multi-fenêtres)
  // — v1.1 nettoyait après le premier apply et devenait sourde : c'était le
  // ping-pong du 24/10. L'idempotence (déjà à la cible ?) rend les
  // ré-affirmations gratuites.
  const origResizeTo = window.resizeTo.bind(window);
  const origMoveTo = window.moveTo.bind(window);
  window.resizeTo = () => {};
  window.moveTo = () => {};

  function getGeometry() {
    const raw = Services.prefs.getStringPref(PREF, DEFAULT) || DEFAULT;
    const parts = raw.split(',').map((v) => parseInt(v.trim(), 10));
    if (parts.length !== 4 || parts.some(Number.isNaN)) {
      console.warn(`[MyWindowSize] pref ${PREF} invalide ("${raw}"), format attendu "x,y,w,h"`);
      return null;
    }
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
  }

  // Déjà à la cible ? (idempotence — tolérance 1px sur la position)
  function atTarget(g) {
    return (
      Math.abs(window.screenX - g.x) <= 1 &&
      Math.abs(window.screenY - g.y) <= 1 &&
      window.outerWidth === g.w &&
      window.outerHeight === g.h
    );
  }

  // Application de la géométrie fixe (idempotent, event-safe).
  function force() {
    // Tant que la fenêtre est maximized / minimized / fullscreen, on ne
    // touche à rien : sizemodechange ré-affirmera au retour en normal
    // (ex: démaximisation manuelle). Le maximize de SESSION ne passe plus
    // par ici (neutrisé ci-dessous), donc un état non-normal = volonté
    // de l'utilisateur ou du WM, jamais de la restauration.
    if (window.windowState !== window.STATE_NORMAL) return;
    const g = getGeometry();
    if (!g || g.w <= 0 || g.h <= 0) return;
    if (atTarget(g)) return;

    origResizeTo(g.w, g.h);
    origMoveTo(g.x, g.y);
    console.log(`[MyWindowSize] géométrie appliquée : (${g.x}, ${g.y}) ${g.w}x${g.h}`);
  }

  // Application éventuelle — force() est idempotent et vérifie l'état.
  function applyOnce() {
    force();
  }

  function onWindowRestored() {
    // #restoreDimensions d'une passe de restauration vient de tourner
    // (position remise à celle de fermeture) → on réaffirme la géométrie
    // voulue. Couvre TOUTES les passes : startup, restoreLastSession,
    // réouverture de fenêtre fermée, restoreWindow.
    force();
  }

  function onSizeModeChange() {
    force();
  }

  // Backstop startup : notification globale tirée après les restaurations.
  function onWindowsRestored() {
    force();
  }

  window.addEventListener('SSWindowRestored', onWindowRestored);

  // Réappliquer au retour en état normal (startup maximized + démaximisation
  // manuelle, retour de minimization/fullscreen).
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
