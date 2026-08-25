# Équilibres Ponctués — Sortie de Stase

> **Concept** : L'évolution n'est pas toujours graduelle. Des plateaux morphologiques sont "ponctués" de crises évolutives rapides.
> **Statut** : implémenté (genos-core::biomimicry::punctuated_equilibria)

## Bénéfice
Quand un agent bute sur le même problème sans faire progresser la métrique (improved=false pendant N cycles), l'algorithme détecte un *plateau*. Il déclenche alors une Punctuation : un pic massif de "température" (ou mutation rate) pour forcer l'exploration de solutions radicalement différentes, échappant ainsi aux minima locaux.
