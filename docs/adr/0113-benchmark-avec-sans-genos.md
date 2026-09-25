# ADR 0113 — Benchmark apparié avec / sans GenOS

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Évaluation, preuves, orchestration
- **Décideurs** : GenOS
- **Lié à** : ADR 0035, ADR 0105, ADR 0036

## Contexte

Trois protocoles comparent déjà des variantes avec et sans GenOS sans campagne
réelle exécutée : le comparatif A-Team (`docs/06-benchmarks/benchmark-ateam.md`,
cinq bras), le longitudinal Holobionte à douze bras (ADR 0105) et l'ablation
runtime A/E (`benchmarks/cognitive-key-ablation/runtime-ablation.cjs`). Le
harness `benchmarks/ateam/benchmarkRunner.cjs` impose un protocole
`paired-counterbalanced-v1` et un gate de preuve (`succeeded && evidenceValid`),
mais aucun `executeCase` réel n'est branché. Les runs `runtime-ablation-*.json`
existants sont inexploitables (`status: idle`, zéro dossier worker).
Le corpus `benchmarks/genos-ablation` est une simulation déterministe sans appel
LLM et ne peut servir de preuve.

Il faut donc figer une première campagne minimale, appariée et vérifiable :
mêmes missions pour chaque bras, même modèle, mêmes budgets, preuves conservées.

## Décision

Lancer la campagne v1 sur le runner A-Team existant, en deux bras d'abord :

- Bras `solo` (sans GenOS : un seul spécialiste, pas de handoffs, pas de
  réparation) contre bras `a_team_full` (handoffs + réparation).
- Corpus figé `benchmarks/ateam/scenarios-v1.json` : 8 missions versionnées,
  texte identique pour les deux bras, chacune avec `scenarioId`, `mission`,
  `verifierId` et `budget` (tokens + timeout).
- Exécution via `backend/bin/genos-orchestrate.cjs` en foreground (pas de
  `background: true`), même modèle Ollama et même budget par paire
  scénario × répétition. Ordre contrebalancé par `rotatedArms`.
- `repetitions = 2` pour le pilote (16 paires), puis `3` pour la campagne
  complète. Chaque essai retourne `succeeded`, `evidenceValid`, `elapsedMs`,
  `tokenCost` lus depuis SQLite, jamais simulés.
- Une réussite n'est comptée que si le travail a réussi ET que sa preuve est
  valide. Tout run sans `evidenceRefs` + `verifierId` est rejeté.
- Le rapport archive : corpus, config des bras, version du modèle, runs bruts,
  reçus par mission. Aucune décision de promotion n'en découle.

## Conséquences

### Positives

- Première mesure réelle avec / sans GenOS, appariée par scénario et
  répétition, interprétable via `pairedDeltas` face au bras `solo`.
- Réutilisation du runner et du gate existants, sans nouveau harness.
- Corpus versionné et réutilisable pour les 5 bras puis le 12-bras Holobionte.

### Négatives

- Coût : 32 exécutions pour le pilote (8 missions × 2 bras × 2 répétitions),
  48 pour la campagne à 3 répétitions ; dérive thermique Ollama et VRAM à
  surveiller.
- Le bras `solo` doit être réellement appauvri (pas de handoffs déguisés) :
  cela repose sur la discipline de l'adaptateur, contrôlée en revue.
- Huit missions ne couvrent ni les 50 missions du longitudinal ni tous les
  domaines ; les conclusions restent bornées au corpus v1.

## Alternatives

- Réutiliser la simulation `benchmarks/genos-ablation` comme preuve :
  rejeté, aucun appel LLM, différences modélisées à la main.
- Lancer directement 12 bras × 50 missions (≥ 600 runs, ADR 0105) : rejeté,
  trop coûteux avant d'avoir validé l'adaptateur sur le pilote 2 bras.
- Comparer des runs historiques non appariés (SWE-bench 9/26) : rejeté, missions
  et budgets différents, effet de variante indissociable.
