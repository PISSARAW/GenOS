# R3-V4 — Counterfactual, monolithe → microservices sous scénarios

**Verdict : PARTIEL (meilleur round 3)** — structure baseline/interventions/deltas présente en W1/W2, désaccord réel avec W3 (invariance). Pas de mesure, que du déclaratif.

## Variant et workers

- Variant `counterfactual` (orch `f6efed56`, 18:56:27 → compared 18:56:43). Rôles basic/interview/self_correcting.

## Mondes

- **W1** : trafic ×20 → migration favorable (scalabilité) ; budget/DevOps ÷2 → maintien monolithe ; **delta explicite** entre mondes. Bon squelette contrefactuel.
- **W2** : conclusions conditionnelles par scénario (favorable/défavorable/baseline). Converge avec W1.
- **W3** : décision **invariante** (facteurs structuraux insensibles au trafic/coûts) — vraie divergence d'attribution causale, non arbitrée (pas de responsable-variable calculé, le service `identifyResponsibleVariables` n'est pas invoqué sur le chemin).

## Mécanisme sous pression

Interventions étiquetées et deltas déclarés, mais **aucun delta mesuré ni attribution calculée** : le mécanisme `counterfactual_dimensions` (baseline/favorable/adverse + delta + responsables) existe en texte de prompts et en services unitaires, pas en exécution comparative. ESCALATE correct.

## Replay / télémétrie / budget

- `launch_round3.cjs V4` ; `status_round3.cjs V4`. ~60 s, 3 runs, 0 $.
