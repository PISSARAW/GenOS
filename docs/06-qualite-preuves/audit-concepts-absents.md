# Concepts canoniques ou transversaux absents de l'inventaire fourni

Cette liste ajoute les concepts explicitement nommés dans les index et contrats du dépôt, sans multiplier les synonymes ni reprendre chaque outil ou stratégie. Elle n'est pas une preuve d'exhaustivité de tous les termes du dépôt. Statuts : **I** implémenté, **V** vérifié, **D** démontré, **U** utilisable, **Doc** documenté ; `O` établi dans la portée citée, `P` partiel, `N` absent, `?` non établi. **Complet** exige cinq `O`. Un test seulement présent sans résultat actuel vaut au plus `P` en V ; une procédure non rejouée vaut au plus `P` en D.

| Concept ajouté | I | V | D | U | Doc | Preuves et lacune principale |
| --- | --- | --- | --- | --- | --- | --- |
| Instinct et Patron d'Action Fixe | P | P | P | P | O | `docs/01-concepts/instinct.md:1-4`, `crates/genos-biology/src/instinct/`, `crates/genos-orchestrator/tests/instinct.rs` ; dispatch hôte requis, CLI `trigger` en validation seule. |
| Modulation endocrinienne des actions innées | P | P | ? | P | O | `docs/01-concepts/instinct.md:68,84-86`, `crates/genos-biology/src/instinct/innate_releasing.rs` ; capteurs/actionneurs réels absents. |
| GVX, développement vérifié des agents | P | P | P | P | O | `docs/01-concepts/gvx.md`, `backend/tests/test_gvx_standard_cycle.js`, `test_gvx_paired_replay_bridge.js` ; sous-parcours nombreux, qualification générale ouverte. |
| Organisme de mission et continuité de mission | P | P | P | P | O | `docs/01-concepts/continuite-mission.md`, `docs/02-orchestration/continuite-mission-organisme.md` ; continuité universelle après panne non démontrée. |
| Organisme mathématique | P | P | P | P | O | `docs/01-concepts/mathematical-organism.md:11-15,49`, `backend/tests/test_mathematical_organism_integration.js` ; prototype, métriques de qualité scientifique non calibrées indépendamment. |
| Philosophie des mathématiques | P | P | ? | P | O | `docs/01-concepts/philosophie-des-mathematiques.md:1-13,73`, `backend/tests/test_mathematical_philosophy_registry.js` ; service interprétatif, aucune autorité runtime implicite. |
| GQWF v2, racines de fichiers et vues durables | P | P | P | P | O | `docs/02-orchestration/gqwf-v2.md:1-7,38-44,92-101`, `backend/src/services/gqwf/`, `backend/tests/test_gqwf_fabric.js` ; publication et bénéfice global non généralisés. |
| Noyau de contrôle morphogénétique et commit versionné | P | P | P | P | O | `docs/02-orchestration/noyau-controle-morphogenetique.md`, `backend/tests/test_morphogenesis_versioned_commit.js`, `test_morphogenesis_runtime_completion.js` ; qualification des variants et effets réels distincte. |
| Snapshots topologiques par variant | P | P | P | P | O | `docs/03-reference/snapshots-topologiques.md`, `backend/tests/test_topology_snapshot_service.js`, `test_syncytium_topology_snapshot_adapter.js` ; frontière collective, pas restauration de tout le collectif. |
| Régulation multi-boucles des workers | P | P | P | P | O | `docs/02-orchestration/regulation-multi-boucles.md`, `backend/tests/test_control_regulation_feedback.js`, `backend/tests/probes/test_real_worker_regulation.cjs` ; effet longitudinal et généralisation à qualifier. |
| Délégation atténuée Biscuit | P | P | P | P | O | `docs/03-reference/delegation-biscuit.md:1-29`, `backend/tests/test_biscuit_delegation.js` ; dépendance et intégration au dispatch selon configuration. |
| Qualification indépendante de l'issue de mission | P | P | P | P | O | `docs/06-qualite-preuves/qualification-issue-mission.md`, `backend/tests/test_mission_outcome_contract.js`, `test_mission_outcome_falsification.js` ; corpus/oracles et couverture des missions à étendre. |
| Qualification des 19 workers au résultat métier | P | P | P | P | O | `docs/06-qualite-preuves/qualification-workers.md`, `backend/tests/test_worker_qualification_inventory.js`, `test_worker_mission_qualification_gate.js`, `run_worker_qualification_campaign.cjs` ; couverture nominale/indépendante de tous les types à revalider. |
| Capsule chiffrée transportable | P | P | P | P | O | `docs/03-reference/capsules-transport.md`, `crates/genos-store/src/capsule.rs`, `mcp/test_native_capsule.mjs` ; intégration et portabilité inter-hôtes à éprouver. |

Ces ajouts constituent une extension de l'inventaire, pas une promotion de maturité. Les cinq critères doivent être attestés sur un même périmètre d'usage et une version identifiée.
