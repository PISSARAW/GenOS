# Matrice finale des preuves des indicateurs

## Règle de lecture

Cette matrice distingue l’implémentation testée de la validation expérimentale.
Un test unitaire ou un commit prouve qu’un contrat s’exécute dans son domaine;
il ne prouve pas à lui seul la propriété cognitive correspondante. Aucun
indicateur n’est promu `passed` tant qu’un reçu expérimental versionné ne lie
pas protocole, profil, seeds, budget, résultat et réplication.

| Registre | Indicateur | Lots reliés | État au lot 25 | Preuve disponible | Limite restante |
|---|---|---:|---|---|---|
| Butlin | RPT-1 Récurrence des entrées | 10 | `implemented_not_validated` | binding récurrent + test | pas de campagne réservée sous occlusion |
| Butlin | RPT-2 Perception intégrée | 10–11 | `implemented_not_validated` | binding, espace inspectable | pas de permutation causale à grande échelle |
| Butlin | GWT-1 Spécialistes parallèles | 12 | `implemented_not_validated` | workspace compétitif | concurrence réelle non mesurée |
| Butlin | GWT-2 Workspace sélectif | 12 | `implemented_not_validated` | capacité, éviction, surcharge | pas de réplication indépendante |
| Butlin | GWT-3 Diffusion globale | 12 | `implemented_not_validated` | helper de workspace : autorisation par module, consommation et sonde d'ablation | le helper n'est branché à aucun chemin de production ; disponibilité globale effective non validée |
| Butlin | GWT-4 Attention dépendante de l’état | 13 | `implemented_not_validated` | prédiction et score d’accord | pas de test reserved |
| Butlin | HOT-1 Perception générative | 11 | `implemented_not_validated` | prior, précision, erreur | modèle génératif limité |
| Butlin | HOT-2 Fiabilité monitorée | 14 | `implemented_not_validated` | erreur confiance/exactitude | calibration adversariale absente |
| Butlin | HOT-3 Croyances/actions corrigées | 14 | `implemented_not_validated` | révision et abstention | pas de boucle mission complète |
| Butlin | HOT-4 Codage parcimonieux/lisse | 11 | `implemented_not_validated` | vecteurs et interpolation | sparsité non mesurée sur corpus |
| Butlin | AST-1 Modèle prédictif de l’attention | 13 | `implemented_not_validated` | allocation et réallocation | leases non ablatés causalement |
| Butlin | PP-1 Codage prédictif | 11 | `implemented_not_validated` | prior/observation/erreur | hiérarchie multi-niveaux non validée |
| Butlin | AE-1 Objectifs concurrents | 16 | `implemented_not_validated` | utilité, pression, invariants | apprentissage longitudinal absent |
| Butlin | AE-2 Contingences action-perception | 15 | `implemented_not_validated` | copie d'efférence corrélée à l'ID d'action, échec/succès d'orchestration routés vers capture ; gain, délai, attribution des effecteurs | test causal logiciel ajouté ; inventaire exhaustif des chemins d'action et perturbations réelles non répliqués |

## Bancs externes

SAD (Situational Awareness Dataset) et MIRROR (benchmark hiérarchique de
métacognition) sont des évaluations externes à exécuter sur un modèle déclaré,
avec son identifiant/version, son protocole d'inférence et les contraintes de
licence/corpus. Ils restent `not_run` : aucun résultat du runtime, test local
ou score synthétique ne les remplace. Ils évaluent des capacités déclaratives
ou métacognitives du système testé et ne sont pas des tests de conscience.

## État des lots

Les lots 01–24 ont un commit, un test ou artefact associé et une limite
documentée dans le suivi. Les lots 02–05 et 17–24 produisent des contrats ou
résumés compatibles avec les reçus versionnés; les résultats de campagne
restent `not_run` tant qu’ils ne sont pas exécutés sur le profil réservé.

| Domaine | Lots | État | Artefact de reproduction |
|---|---:|---|---|
| Registre et contrats | 01–02 | `implemented_not_validated` | commandes ciblées du suivi |
| Persistance et expérimentation | 03–05 | `implemented_not_validated` | services de reçus, runner, manifeste |
| Rapport et gates | 06–07 | `implemented_not_validated` | pipeline TruthGraph et gate final |
| Circuit cognitif | 08–16 | `implemented_not_validated` | tests ciblés Node |
| Morphogenèse et apprentissage | 17–22 | `implemented_not_validated` | tests ciblés et ADR |
| No-report et campagne réservée | 23–24 | `implemented_not_validated` | ablation et campagne hashée |
| Documentation | 25 | `complete_documentation` | ce document et le suivi |

## Commandes de reproduction

```powershell
node backend/tests/test_versioned_contract_service.js
node backend/tests/test_versioned_contract_persistence.js
node backend/tests/test_experimental_runner.js
node backend/tests/test_validation_protocol.js
node backend/tests/test_truth_graph_semantic_pipeline.js
node backend/tests/test_final_output_gate.js
node backend/tests/test_world_state_conditional.js
node backend/tests/test_controlled_rollout_decision.js
node backend/tests/test_perceptive_binding.js
node backend/tests/test_generative_perceptual.js
node backend/tests/test_global_workspace.js
node backend/tests/test_model_controlled_attention.js
node backend/tests/test_metacognitive_belief_action.js
node backend/tests/test_self_effector_model.js
node backend/tests/test_allostatic_objectives.js
node backend/tests/test_morphogenetic_population.js
node backend/tests/test_fitness_pareto_destiny.js
node backend/tests/test_hypothesis_action_planner.js
node backend/tests/test_experimental_verdict_planner.js
node backend/tests/test_intermissions_consolidation.js
node backend/tests/test_morphogenesis_operator_benchmark.js
node backend/tests/test_no_report_ablation.js
node backend/tests/test_reserved_replication_campaign.js
```

## Suivi de dérive

Recalculer la matrice après toute modification de code, modèle, schéma,
protocole, corpus ou dépendance. Invalider les reçus affectés si leur hash de
manifest, version de contrat ou révision de code change. Conserver les échecs,
timeouts et données manquantes au dénominateur; ne pas remplacer un résultat
`inconclusive` par zéro.

Les contrôles globaux restent obligatoires :

```powershell
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

La baseline connue contient encore une dette qualité et un échec Rust décrit
dans [`suivi-validation-indicateurs.md`](suivi-validation-indicateurs.md).
