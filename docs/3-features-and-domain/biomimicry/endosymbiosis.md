# Endosymbiose — Internalisation d'Outils

> **Concept** : Une cellule eucaryote englobe une bactérie qui, au fil de l'évolution, devient un organite interne ultra-efficace (comme la mitochondrie).
> **Statut** : implémenté (genos-core::biomimicry::endosymbiosis)

## Bénéfice
Quand un agent fait appel 10 000 fois à un script externe lent (ex: appel API Python), l'outil iomimicry_cellular_endosymbiosis "engloutit" l'outil externe : il compile sa logique sous forme de binaire WebAssembly ou module natif Rust, éliminant ainsi toute la latence réseau. C'est l'évolution d'un outil externe vers un organe interne.
