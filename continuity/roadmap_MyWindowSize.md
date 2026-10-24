# Roadmap — MyWindowSize

## File priorisée

(néant — mod stable après le fix 1.1.0)

## Leçons de plateforme

- **Firefox récent (base Zen oct. 2025)** : `SessionStore.#restoreDimensions` restaure la **position** via `getBaseWindow(aWindow).setPositionDesktopPix()` (nsIBaseWindow — objet C++, non monkey-patchable) et non plus `window.moveTo()` → tout patch JS de `moveTo`/`resizeTo` est inopérant sur la position. Contournement : les events fenêtre `SSWindowRestoring` (début de `#restoreWindow`) et `SSWindowRestored` (dispatché à la résolution du promise de `#restoreWindowFeatures`, donc **après** `#restoreDimensions`) permettent de s'intercaler — ne pas poser la géométrie pendant la restauration, la réaffirmer sur `SSWindowRestored`.
- **La restauration peut passer APRÈS notre premier apply** (injection Sine tardive, `restoreLastSession` multi-fenêtres, maximisation finalisée tardivement par le WM) → un mod qui se « retire » après son premier apply (cleanup de listeners) devient sourd et perd le ping-pong. Contournement : listeners permanents + réaffirmation idempotente (`atTarget` ±1px) sur chaque event ; et neutriser `window.maximize()` (les seuls appelants JS du build sont les 2 lignes de `#restoreDimensions` — le maximize manuel passe par le natif).

## Livré & poussé

| Version | Quoi | Validation | Hash |
|---|---|---|---|
| 1.2.0 | Fix ping-pong résiduel : `maximize()` neutrisé, listeners permanents + réaffirmation idempotente ; géométrie défaut `260,20,1400,1000` (1405x976 Spy arrondis à la cinquantaine, centrés en zone de travail 1920x1040) | Constat opérateur 24/10 : position tient (+2s, +5s), zéro ping-pong, 20px au-dessus de la taskbar | `ea6f84e` (push en attente) |
| 1.1.0 | Fix ping-pong position : skip apply au load si restauration pending (`SSWindowRestoring`) + réaffirmation sur `SSWindowRestored`, backstop `sessionstore-windows-restored`, `sizemodechange` conservé | Constat opérateur 21/10 : un seul saut vers la géométrie pref (281,103 — 1358x835), position tient | `9bfd05b` (push en attente) |
| 1.0.0 | Initial — no-op `resizeTo`/`moveTo` + apply au load/`sizemodechange`/`sessionstore-windows-restored` | Constat opérateur à l'époque ; cassé par la maj Zen (voir leçon plateforme) | `ab4d347` |
