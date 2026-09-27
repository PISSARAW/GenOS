# ADR 0148 — Workspace global et ignition compétitive

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Cognition, espace de travail global, diffusion
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/globalWorkspaceService.js` (`admit`, `compete`, `diffuse`)
  - `../../backend/src/services/ignitionService.js` (accumulateur à fuite, seuil, burst, période réfractaire)
  - Tests : `../../backend/tests/test_global_workspace.js`

## Contexte

Sans capacité explicite ni compétition, tout contenu pouvait inonder les modules consommateurs sans seuil mesurable ni traçabilité du gagnant diffusé.

## Décision

Le workspace possède une capacité explicite (défaut 3). Les contenus sont en compétition sur la saillance, les évictions sont conservées (`admitted` / `evicted`, `overloaded`), et une ignition exige un seuil mesurable (défaut 1,0 ; burst × 1,5, local × 0,9, réfractaire × 0,8 côté ignition). Seul le gagnant est diffusé aux modules autorisés, avec l'ID du contenu rendu traçable (`contentId`, `available`).

## Conséquences

- Positives : compétition mesurable, évictions auditées, diffusion limitée au gagnant avec modules destinataires explicites.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; capacité et seuils par défaut conventionnels, non appris.
- Neutres : sans gagnant, aucune diffusion (liste de modules vide côté workspace).

## Alternatives

- **Diffusion linéaire de tout événement** : rejetée — aucun filtrage, aucune traçabilité du gagnant.
- **Capacité illimitée** : rejetée — saturation des consommateurs sans signal de surcharge.
