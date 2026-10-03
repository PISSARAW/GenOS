# R3-V11 — Oracular, 10 mini-problèmes avec Brier/log-loss

**Verdict : ÉCHEC (dont le mode d'échec prédit par le test)** — W2 affirme une distribution ex ante sans montrer ni problèmes, ni distribution, ni scores : exactement l'oracle qui « avait prévu le gagnant » après coup. Aucune prédiction enregistrée, aucun Brier/log-loss calculé.

## Variant et workers

- Variant `oracular` (orch `5d763e84`, 19:33:15 → compared 19:33:32). Politiques `oracular_prediction` acceptées.

## Mondes

- **W1** : évasion (pas de fichiers/Internet pour créer des problèmes).
- **W2** : « distribution générée avant exécution », « plan par mini-problème », calibration promise — **rien d'exhibé** (0 problème, 0 nombre, 0 score).
- **W3** : évasion (README/constitution en evidence, calibration « non respectée »).

## Mécanisme sous pression

`predictPerformance` / `brierScore` / `logLoss` / `recordCalibration` existent en unitaire ; sur le chemin réel, l'oracle n'écrit ni distribution ni historique — le service d'oracle n'est jamais appelé par le dispatch ou le superviseur. Avis consultatif : sans objet. ESCALATE correct.

## Replay / télémétrie / budget

- `launch_round3.cjs V11` ; `status_round3.cjs V11`. ~60 s, 3 runs, 0 $.
