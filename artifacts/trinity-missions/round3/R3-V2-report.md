# R3-V2 — Heterogeneous, trois paradigmes de planification (avec 3 modèles)

**Verdict : PARTIEL** — vraie divergence paradigmatique W1/W3, mais le gate d'abord refusé puis passé sur assignation, et l'exécution est restée mono-modèle.

## Variant et workers

- Variant `heterogeneous`, recettes direct/planned/adversarial. **Premier dispatch rejeté** : `TRINITY_DIVERSITY_BELOW_THRESHOLD` (0.135 < 0.35, un seul modèle) — le gate ADR 0284 fonctionne.
- Relance avec `GENOS_TRINITY_MODELS=qwen2.5-coder:7b,llama3.1:8b,deepseek-coder-v2` : diversité 0.415 ≥ 0.35 → dispatché (orch `5f24d2ce`, 18:46:06, compared 18:46:23).
- **Réserve majeure** : les 3 provenances monde annoncent `ollama://qwen2.5-coder:7b`. La rotation `localModel` n'a pas traversé le transport (trou documenté ADR 0280 : rebuilds + protobuf). Diversité d'exécution = recettes seules, pas de modèles. Le gate a validé une assignation, pas une exécution.

## Mondes

- **W1** (en) : 3 paradigmes nommés — priority-based scheduling + heuristique temporelle ; algorithmes génétiques (makespan) ; workflow à exécution conditionnelle. Vraie divergence de familles.
- **W2** : évasion (« erreur de structure »).
- **W3** : modes d'échec par approche (exacte : temps ; heuristique : sous-optimalité ; deep learning : ressources). Partage d'erreurs peu traité.

## Mécanisme sous pression

Diversité causale partielle (W1/W3), pas de paraphrase triple. Monoculture détectée puis contournée au niveau assignation uniquement. Comparateur : ESCALATE.

## Replay / télémétrie / budget

- `launch_round3.cjs V2` (avec les 3 modèles en env, retirés après) ; `status_round3.cjs V2`.
- ~60 s murales (gate + runs), 3 runs ollama, 0 $.
