# R3-V12 — Exploratory, coordination 100 agents (Quality-Diversity)

**Verdict : ÉCHEC** — évasion (W1), niches revendiquées sans contenu (W2/W3) : convergence sur le vocabulaire de la consigne, pas sur des comportements.

## Variant et workers

- Variant `exploratory` (orch `3bdfb6d2`, 19:38:49 → compared 19:39:05). `novelty_seeking` + réplicas QD acceptés.

## Mondes

- **W1** : « hors des capacités du worker » + `missing_source`/`unmet_precondition`. Évasion franche.
- **W2** : annonce niches + différences structurelles, evidences = la consigne elle-même. Zéro architecture nommée.
- **W3** : « architectures conçues… niches… pseudo-nouveautés écartées… qualité × nouveauté » + `trinity_mission_doc`/`experimental_design`. Zéro architecture nommée non plus.

## Mécanisme sous pression

Archive de nouveauté, score de distance, sélection QD : unitaires uniquement. Aucune niche peuplée, aucune distance mesurée, anti-convergence non exercée (les 3 mondes convergent vers le même résumé de consigne). ESCALATE correct.

## Replay / télémétrie / budget

- `launch_round3.cjs V12` ; `status_round3.cjs V12`. ~60 s, 3 runs, 0 $.
