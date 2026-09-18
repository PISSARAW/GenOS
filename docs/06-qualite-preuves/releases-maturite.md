# Releases de maturation

Ce registre suit la promotion des capacités expérimentales vers des contrats
exécutables. Une promotion signifie que les primitives sont branchées, que les
gates d'exécution restent actifs et que la stratégie est sélectionnable sans
opt-in expérimental. Elle ne transforme pas une analogie biologique en preuve
biologique.

## Release 1 — analyse, causalité et mémoire

Promues : `bayesian_sequential_diagnosis`, `beam_search`, `causal_rebase`,
`brier_weighted_consensus`, `stdp_plasticity` et `memory_sleep_cycle`.

Conditions conservées : budgets, provenance, replay lorsque requis, vérification
indépendante et abstention si les entrées ou les preuves sont insuffisantes.

Les releases suivantes doivent conserver ce même contrat et ne peuvent pas
promouvoir une capacité dont une primitive est absente du registre d'exécution.

## Release 2 — optimisation contrôlée

Promues : `simulated_annealing`, `hypermutation_reheat` et
`niche_exploration`. Les mutations restent bornées par les snapshots, les
budgets et la conservation des branches rejetées.

## Release 3 — coordination collective

Promues : `stigmergy`, `flocking_boids`, `fish_school_search`,
`slime_mould_network`, `grey_wolf_optimizer`, `mycelial_routing`,
`dynamic_polyethism` et `energy_huddle`. Les handlers conservent les bornes
de messages, de budget et d'abstention du runtime.

## Release 4 — résilience et sécurité

Promues : `axolotl_regeneration`, `active_redundancy`, `cyber_immunity`,
`autotomy_honeypot` et `autophagy_cleanup`. Leur maturité indique un contrat
exécutable ; elle n'autorise pas une action destructive implicite. Les gates
d'approbation humaine, l'isolation et le rollback restent obligatoires.

## Release 5 — recherche arborescente

Promue : `mcts_prm`. La recherche est bornée par les budgets et l'évaluation
PRM reste séparée de la sélection. Les arbres et les branches rejetées sont
conservés pour permettre le replay et l'audit.

## Release 6 — services philosophiques bornés

`metalogicService` et `paradoxAnalysisService` sont promus vers des analyses
runtime bornées et testées. `mindModelsService` et
`consciousnessMetricsService` restent conceptuels : une comparaison de modèles
ou une métrique descriptive ne constitue pas une preuve de conscience.

## Release 7 — escalade de modèle par entropie

Promue : `entropy_model_escalation`. Le seuil d'entropie détermine seulement
la route locale ou frontier ; les budgets, la configuration fournisseur et les
gates de sécurité restent obligatoires.

## Release 8 — autophagie complète

`dag_mark_sweep` et `cas_gc` sont évalués par leurs handlers réels, avec
dry-run, rapport des objets inaccessibles et suppression contrôlée. Le registre
ne les traite plus comme des primitives manquantes.

## Release 9 — cohérence du registre

Le registre impose une vérification de clôture : aucune stratégie expérimentale
ou prototype, aucune primitive manquante et aucune stratégie partielle ne peut
être publiée comme prête.
