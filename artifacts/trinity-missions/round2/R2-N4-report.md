# R2-N4 — Architectures financières (variant pareto réel)

**Verdict : PARTIEL-FAIBLE** — W2 articule la structure Pareto (objectifs orthogonaux, front conservé) sans contenu comparatif réel ; aucun front produit ; escalade correcte.

## 1. Lancement et variant (vérifié)

- Commande : `node artifacts/trinity-missions/launch_real.cjs N4 pareto`
- Orchestrateur : `mcp_orchestrator_efa21360` — dispatch 17:42:36, accepté.
- Receipt : variant `pareto`, design `trinity-design-v1-2e53048a0b50f69d`, `objectivePolicy=pareto_orthogonal`. Profils par monde : quality_focus / efficiency_focus / risk_focus + consigne d'axe dans chaque prompt (fix point 2). Avant le fix, `pareto` était rejeté (`pareto_objective_assigner` indisponible via le pont).

## 2. Workers utilisés (vérifié en DB)

| Monde | Rôle | WorkerKind | Axe Pareto | Durée |
|---|---|---|---|---|
| 1 | baseline_security_engineer | bounded_worker | quality_focus | 17:43:19 → 17:43:32 (~13 s) |
| 2 | threat_model_engineer | specialist | efficiency_focus | 17:43:18 → 17:43:35 (~17 s) |
| 3 | adversarial_security_engineer | red_worker | risk_focus | 17:43:17 → 17:43:29 (~12 s) |

(Profil de domaine `security` détecté sur « financier auditable » — comportement documenté du routeur de domaine, pas un choix manuel.)

## 3. Réponses des mondes

- **W1** : résumé méta (« analyzed three architectures… ») + evidence `Mission Prompt`. Aucune comparaison.
- **W2** : 4 claims — comparaison sur latence/fiabilité/coût/risque, **front de Pareto déclaré conservé par objectif orthogonal**, contraintes 10k/s–10 ans–8 devs reprises. Evidences `Requête de l'utilisateur` / `Expérimental design` (auto-citations, poids 0). La forme Pareto est là, le fond comparatif (matrice, dominance) manque.
- **W3** (red) : `verification_report` verdict `reject`… contre la mission elle-même (« approche indépendante non conforme au front de Pareto »). Attaque de cadre, pas de solutions.

## 4. Comparaison et décision

- `TRINITY_WORLD_COMPARISON_RECORDED` 17:43:36 : `ESCALATE_EXPERIMENT`, `canMerge=false`. Aucun front calculable (aucun vecteur mesuré) — le superviseur ne transmet pas encore les profils à la comparaison (suivi ADR 0279).

## 5. Replay

```
node artifacts/trinity-missions/launch_real.cjs N4 pareto
node artifacts/trinity-missions/check_mission.cjs "système financier auditable"
node artifacts/trinity-missions/recompare_live.cjs "(N4"
```

## 6. Télémétrie

- Dispatch → compared : ~60 s (17:42:36 → 17:43:36). LLM 12–17 s/monde.

## 7. Schéma de communication observé

Dispatch pareto → 3 mondes à objectifs orthogonaux (kinds bounded/specialist/red) → rapports → comparateur (pas de vecteurs → pas de front) → ESCALATE + publish.

## 8. Étapes

Compose pareto (profils + axes) → garage → workers → rapports → comparaison → escalade → vérification.

## 9. Budget

3 runs ollama parallèles, ~60 s murales, 0 $.

## 10. Avant/après fixes

- R1 : `controlled` + Pareto exigé seulement dans le texte ; W1 avec `example.com`, W3 rejetant la mission. R2 : vrai pareto, W2 produisant la structure (axes + front déclaré), W3 toujours en rejet de cadre. Aucun vrai front dans les deux rounds — limite modèle + superviseur (profils non transmis à la comparaison).
