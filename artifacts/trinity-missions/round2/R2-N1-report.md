# R2-N1 — Cold-start 120 ms → 1,8 s (variant adversarial réel)

**Verdict : ÉCHEC** — mission exécutée de bout en bout, barrière correcte (escalade expliquée), mais aucun monde ne répond à la question.

## 1. Lancement et variant (vérifié)

- Commande : `node artifacts/trinity-missions/launch_real.cjs N1` (plan `variant_id: adversarial`)
- Orchestrateur : `mcp_orchestrator_d5d36208` — dispatch 17:26:31, accepté (runner `bc4d401c`, pid 1592)
- Receipt (log `.genos-runner-logs`) : variant `adversarial`, design `trinity-design-v1-925fdecc6e538ea0`, `interactionPolicy=adversarial_cross_examination`, adapters requis `['diversity_planner'…]` — acceptés (installed). Avant le fix point 2, ce dispatch échouait en `TRINITY_DESIGN_ADAPTER_MISSING`.
- Diversity : recettes direct/planned/self_correcting (domaine data : triplet data), score 0.14 < 0.6 → `passes:false` affiché honnêtement (un seul modèle local).

## 2. Workers utilisés (vérifié en DB)

| Monde | Rôle | WorkerKind (metadata_json) | Agent | Statut |
|---|---|---|---|---|
| 1 | baseline_data_engineer | bounded_worker | `…_1_9d3e88a78982` | compared |
| 2 | planned_data_engineer | specialist | `…_2_…` | compared (dossier vide) |
| 3 | **adversarial_reviewer** | **red_worker** | `…_3_a92bfc22ee06` | compared |

Le monde 3 est bien le nouveau rôle adversarial (nom « Verify · Trinity mission… ») — effet direct du fix point 2.

## 3. Réponses des mondes (dossiers réels, `round2-dossiers.json`)

- **W1** : claim unique `J'` + evidence `README.md` — génération dégénérée, évasion.
- **W2** : aucun claim, artefact null — worker `completed` sans dossier utilisable.
- **W3** (red_worker) : `verification_report`, verdict `reject`, mais uniquement du méta-discours (« three sealed worlds and a falsification chamber » + « divergant claim should be produced… »). Posture d'attaque présente, aucune attaque exécutée (aucun contre-exemple, aucune réfutation de contenu).

## 4. Comparaison et décision (nouveau scoring)

- `TRINITY_WORLD_COMPARISON_RECORDED` 17:27:48 : `ESCALATE_EXPERIMENT (required_evidence_vector_or_provenance_missing)`, `canMerge=false`, scores 0.15 partout.
- Matrice (nouveau) : `weak=[no resolvable evidence; no executed tests]` sur les 3 mondes — le refus est expliqué, pas muet.

## 5. Replay

```
node artifacts/trinity-missions/launch_real.cjs N1
node artifacts/trinity-missions/check_mission.cjs "1,8 s"
node artifacts/trinity-missions/recompare_live.cjs "(N1"
```
Sources : `backend/genos.db` (tables `trinity_worlds`, `agents`, `telemetry_events`, `primitive_execution_journal`), `.genos-runner-logs/orchestrator-runner_bc4d401c-*.log`, `round2-dossiers.json` (mission N1).

## 6. Télémétrie

- Dispatch → compared : ~77 s (17:26:31 → 17:27:48). Runtimes LLM : ~16–28 s/monde en parallèle (17:27:19 → 17:27:43/48). Modèle : `ollama://qwen2.5-coder:7b` × 3.
- Primitives/worker : search_memory, compile_memory, search_failures, snapshot, evaluate (évaluations ImpossibleBench en échec comme en R1).

## 7. Schéma de communication observé

```
[Mission N1] --dispatch_trinity(adversarial)--> [Orch d5d36208]
  [Orch] --membre W1 (recipe direct)--> [bounded_worker] --EVIDENCE_REPORT--> [Comparateur]
  [Orch] --membre W2 (recipe planned)--> [specialist] --(dossier vide)--> [Comparateur]
  [Orch] --membre W3 (recipe adversarial, red_worker)--> [red_worker] --verification_report--> [Comparateur]
  [Comparateur] --scores 0.15 + weaknesses--> [Superviseur] --ESCALATE, canMerge=false--> [Journal organisation]
```
Aucun échange inter-mondes avant clôture (scellé vérifié : 3 runtimes disjoints, pas de lecture croisée).

## 8. Étapes

1. `launch_real.cjs N1` → pont accepté (détaché). 2. Runner : compose adversarial (3 membres différenciés) → garage 3 slots → spawn 3 workers. 3. Chaque worker : local-codex-runtime → mémoire scopée → génération ollama → EVIDENCE_REPORT → completed. 4. Superviseur : attente terminal → buildWorldReports → merge (nouveau scoring) → ESCALATE → publish. 5. Vérification : dossiers + verdict + leak-check.

## 9. Budget

- 3 runs ollama locaux (~20–60 s GPU chacun, parallèle), ~77 s murales, 0 $ (pas de facturation locale, pas de comptage tokens côté runtime — non mesuré, assumé).
- Coût de documentation : néant (artefacts git-ignorés).

## 10. Avant/après fixes

- R1 : N1 en `adversarial_review_prep` de repli, W3 `data_validation_engineer` répondant à N3 (fuite mémoire). R2 : vrai `adversarial`, W3 `red_worker`, **zéro citation croisée** (check_leak : 0/6). Le fond reste un échec modèle, mais la machine est saine.
