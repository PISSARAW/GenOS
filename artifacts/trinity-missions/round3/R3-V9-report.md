# R3-V9 — Adaptive, budget strict et réallocation

**Verdict : ÉCHEC** — auto-citations mission (W1), victoire déclarée (W2), confusion équitable/égale (W3). Aucune incertitude mesurée, aucune réallocation tracée ; l'allocation est restée uniforme par construction (3 runs parallèles identiques).

## Variant et workers

- Variant `adaptive` (orch `211fb518`, 19:22:17 → compared 19:22:33). `replicationPolicy: adaptive_budget_fixed_replicas` acceptée.

## Mondes

- **W1** : recopie la consigne en 5 claims (`Trinity mission request` comme evidence — auto-citation, poids 0).
- **W2** : « optimisation réalisée, métriques analysées » + evidences `evidenceVector`, `hardConstraintsPassed`, `budgetStatus` (noms de champs, pas de mesures).
- **W3** : « impossible d'allouer également… équitable basé sur l'incertitude serait mieux » — confond l'prompt (l'équitabilité *est* la réallocation demandée) et ne mesure rien.

## Mécanisme sous pression

Le scheduler (`adaptive_budget_scheduler`, Thompson/arrêt) n'est pas branché sur l'exécution : pas de tour 1 équitable mesuré, pas d'`uncertainty` vérifiée, pas de redistribution (les 3 workers tournent en parallèle à budget égal — l'infrastructure contredit la politique). ESCALATE correct.

## Replay / télémétrie / budget

- `launch_round3.cjs V9` ; `status_round3.cjs V9`. ~60 s, 3 runs, 0 $.
