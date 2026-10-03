# R2-N3 — Lenteurs 2–4 s (variant controlled)

**Verdict : PARTIEL (meilleur dossier réel de la campagne)** — W1 compare vraiment les 3 hypothèses avec le bon biais (verrou) et des observations discriminantes ; preuves non résolvables → escalade correcte.

## 1. Lancement et variant (vérifié)

- Commande : `node artifacts/trinity-missions/launch_real.cjs N3`
- Orchestrateur : `mcp_orchestrator_a71f877d` — dispatch 17:38:07, accepté.
- Receipt : variant `controlled`, design `trinity-design-v1-fa00945a3cd8fa76` (baseline intégral : sealed, shared_evidence_vector). Diversity 0.14 `passes:false`.

## 2. Workers utilisés (vérifié en DB)

| Monde | Rôle | WorkerKind | Agent | Durée LLM |
|---|---|---|---|---|
| 1 | basic_implementation | bounded_worker | `…_1_…` | 17:38:52 → 17:39:08 (~16 s) |
| 2 | interview_plan_implementation | specialist | `…_2_…` | 17:38:51 → 17:38:59 (~8 s) |
| 3 | self_correcting_implementation | adaptive_worker | `…_3_…` | 17:38:51 → 17:39:05 (~14 s) |

## 3. Réponses des mondes

- **W1** : verrou la plus soutenue (CPU bas + mémoire stable = concurrence sur ressources partagées) ; GC discutée comme cause potentielle ; réseau jugé moins probable (mauvais argument : « ne devrait pas faire baisser le CPU » — faux, l'attente IO baisse le CPU). Evidences `README` + intitulés (poids 0). Bonne structure, preuves nulles.
- **W2** : trois reformulations des faits + `<source-ref>` × 3. Zéro information ajoutée ; scoring 0.
- **W3** : verrou favorisée + éléments contradictoires + observations discriminantes (niveau de contention, temps d'attente des verrous) ; evidences `Source ref ID N` (placeholders). Le fond le plus proche d'une vraie analyse, preuves fabriquées.

## 4. Comparaison et décision

- `TRINITY_WORLD_COMPARISON_RECORDED` 17:39:08 : `ESCALATE_EXPERIMENT`, `canMerge=false`. Matrice nomme `N unresolvable evidence refs` (W2/W3) — avant le fix, `evidence1`-style pesait.

## 5. Replay

```
node artifacts/trinity-missions/launch_real.cjs N3
node artifacts/trinity-missions/check_mission.cjs "ralentissements"
node artifacts/trinity-missions/recompare_live.cjs "(N3"
```

## 6. Télémétrie

- Dispatch → compared : ~61 s (17:38:07 → 17:39:08). Le plus rapide du round 2.

## 7. Schéma de communication observé

Trois mondes scellés (bounded/specialist/adaptive) → EVIDENCE_REPORTs → comparateur (poids résolvables) → superviseur → ESCALATE + publish. Mémoire scopée active : aucune citation N1/N2/N4 dans les 3 dossiers (check_leak 0).

## 8. Étapes

Compose controlled → garage → 3 workers → rapports → comparaison → escalade expliquée → vérification documentaire.

## 9. Budget

3 runs ollama (8–16 s chacun — les plus courts), ~61 s murales, 0 $.

## 10. Avant/après fixes

- R1 : W1 évasion (« task unclear »). R2 : W1 répond vraiment et compare les 3 hypothèses. Le scellage mémoire tient (plus de `<source-ref>` hérité d'autres missions, mais le modèle en génère encore spontanément — sanctionné à 0).
