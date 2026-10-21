# Roadmap — MyWindowSize

## File priorisée

(néant — mod stable après le fix 1.1.0)

## Leçons de plateforme

- **Firefox récent (base Zen oct. 2025)** : `SessionStore.#restoreDimensions` restaure la **position** via `getBaseWindow(aWindow).setPositionDesktopPix()` (nsIBaseWindow — objet C++, non monkey-patchable) et non plus `window.moveTo()` → tout patch JS de `moveTo`/`resizeTo` est inopérant sur la position. Contournement : les events fenêtre `SSWindowRestoring` (début de `#restoreWindow`) et `SSWindowRestored` (dispatché à la résolution du promise de `#restoreWindowFeatures`, donc **après** `#restoreDimensions`) permettent de s'intercaler — ne pas poser la géométrie pendant la restauration, la réaffirmer sur `SSWindowRestored`.

## Livré & poussé

| Version | Quoi | Validation | Hash |
|---|---|---|---|
| 1.1.0 | Fix ping-pong position : skip apply au load si restauration pending (`SSWindowRestoring`) + réaffirmation sur `SSWindowRestored`, backstop `sessionstore-windows-restored`, `sizemodechange` conservé | Constat opérateur 21/10 : un seul saut vers la géométrie pref (281,103 — 1358x835), position tient | `9bfd05b` (push en attente) |
| 1.0.0 | Initial — no-op `resizeTo`/`moveTo` + apply au load/`sizemodechange`/`sessionstore-windows-restored` | Constat opérateur à l'époque ; cassé par la maj Zen (voir leçon plateforme) | `ab4d347` |
