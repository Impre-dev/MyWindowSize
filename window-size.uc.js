// ==UserScript==
// @name           MyWindowSize
// @version        1.3.0
// @description    Force la géométrie de la fenêtre (x, y, largeur, hauteur) à chaque lancement — neutralise la restauration SessionStore.
// @author         Impre
// @include        main
// ==/UserScript==

(function () {
  'use strict';

  // Réglages via le panneau Sine (preferences.json) : 4 prefs STRING
  // écrites par MCM — lecture défensive pattern SidePeek (parseInt +
  // fallback getIntPref pour une pref posée à la main en about:config).
  // Défauts calqués sur Agora (Window Spy 01/11, outer) : x252 y24 —
  // 1416x999. 24+999=1023 < 1040 (haut de taskbar) → zéro chevauchement.
  const DEFS = { x: 252, y: 24, w: 1416, h: 999 };

  // PREFS (pattern SidePeek/NavBtn) : MCM écrit des STRING — parseInt ici,
  // avec fallback getIntPref pour une pref int posée à la main.
  const int = (name, fallback) => {
    try {
      if (!Services.prefs.prefHasUserValue(name)) return fallback;
      const n = parseInt(Services.prefs.getStringPref(name, ''), 10);
      if (Number.isFinite(n)) return n;
      return Services.prefs.getIntPref(name);
    } catch (e) {
      return fallback;
    }
  };

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
    return {
      x: int('mywindowsize.x', DEFS.x),
      y: int('mywindowsize.y', DEFS.y),
      w: int('mywindowsize.width', DEFS.w),
      h: int('mywindowsize.height', DEFS.h),
    };
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

  // Réglages live : tout changement dans le panneau Sine → réaffirmation
  // (idempotente : atTarget court-circuite si rien ne bouge).
  const prefsObs = {
    observe(subject, topic) {
      if (topic === 'nsPref:changed') force();
    },
  };
  ['mywindowsize.x', 'mywindowsize.y', 'mywindowsize.width', 'mywindowsize.height']
    .forEach((name) => Services.prefs.addObserver(name, prefsObs));

  // Application la plus précoce possible (cas sans restauration SessionStore).
  if (document.readyState === 'complete') {
    applyOnce();
  } else {
    window.addEventListener('load', () => applyOnce(), { once: true });
  }
})();
