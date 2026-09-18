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
