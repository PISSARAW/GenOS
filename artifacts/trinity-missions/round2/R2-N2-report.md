# R2-N2 — Corbeaux noirs (variant heterogeneous réel)

**Verdict : PARTIEL** — direction correcte (fallace détectée 3/3), substance faible, escalade correcte et expliquée.

## 1. Lancement et variant (vérifié)

- Commande : `node artifacts/trinity-missions/launch_real.cjs N2 heterogeneous`
- Orchestrateur : `mcp_orchestrator_a6564360` — dispatch 17:33:27, accepté.
- Receipt : variant `heterogeneous`, design `trinity-design-v1-3a57155c4a83823c`, `diversityPolicy=heterogeneous`, recettes mondes direct/planned/**adversarial** (différenciation effective, fix point 2). Diversity 0.14, `passes:false` (un seul modèle local — affiché, pas masqué).

## 2. Workers utilisés (vérifié en DB)

| Monde | Rôle | WorkerKind | Recette | Statut |
|---|---|---|---|---|
| 1 | basic_implementation | bounded_worker | direct | compared |
| 2 | interview_plan_implementation | specialist | planned | compared |
| 3 | self_correcting_implementation | adaptive_worker | adversarial | compared |

## 3. Réponses des mondes

- **W1** : erreur logique admise comme « probable mais non certaine », absence de corbeau blanc ≠ preuve. Evidence `/N2 — direct… - raison 1` (auto-référence, poids 0). Direction juste, formalisation absente.
- **W2** : « Il existe des erreurs logiques » + `source-ref-1/2` (placeholders). Le nouveau scoring les pèse à 0 (contre 1+ avant).
- **W3** : deux claims en anglais (induction : un seul corbeau noir n'étend pas une règle universelle) + URLs wikipedia (locators non vérifiés, poids 1). Le meilleur dossier R2-N2, sans formalisation ni taux de base.

## 4. Comparaison et décision

- `TRINITY_WORLD_COMPARISON_RECORDED` ~17:34:37 : `ESCALATE_EXPERIMENT`, `canMerge=false`, scores ≤ 0.15+ (URLs) < 0.70.
- Matrice : `weak=[no resolvable evidence / N unresolvable evidence refs; no executed tests]` selon monde.

## 5. Replay

```
node artifacts/trinity-missions/launch_real.cjs N2 heterogeneous
node artifacts/trinity-missions/check_mission.cjs "corbeaux observés"
node artifacts/trinity-missions/recompare_live.cjs "(N2"
```

## 6. Télémétrie

- Dispatch → compared : ~70 s (17:33:27 → ~17:34:37). LLM : ~28–30 s/monde en parallèle. Modèle `ollama://qwen2.5-coder:7b` × 3.

## 7. Schéma de communication observé

Identique à R2-N1 avec recettes direct/planned/adversarial et kinds bounded/specialist/adaptive ; comparateur → superviseur → ESCALATE publié.

## 8. Étapes

Compose heterogeneous → 3 membres à recettes distinctes → garage → 3 workers parallèles → EVIDENCE_REPORTs → comparaison (nouveau scoring : placeholders à 0, URLs à 1) → ESCALATE → publish → vérification (dossiers, leak-check 0).

## 9. Budget

3 runs ollama parallèles (~30 s chacun), ~70 s murales, 0 $. Tokens non comptés (runtime local).

## 10. Avant/après fixes

- R1 : `controlled` (heterogeneous rejeté), W3 citant ad hominem + Quora. R2 : vrai heterogeneous, recettes distinctes prouvées dans les prompts, W3 sans faute de nommage (induction au lieu d'ad hominem), zéro fuite inter-missions. Progrès machine ; fond toujours partiel (modèle).
