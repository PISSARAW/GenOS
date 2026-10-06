# ADR 0335 - Mesurer la propagation différentielle du Rhizome

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Rhizome, RPE, calcul incrémental

## Décision

Isoler une expérience Differential Dataflow sur les arêtes de dépendance.
L'ajout et le retrait doivent produire des deltas opposés sans appel de modèle.
Le prototype reste hors du chemin de production tant qu'un profilage sur des
graphes GenOS réels ne démontre pas un bénéfice supérieur au coût opérationnel.

## Limites

Le test est déterministe et petit. Il ne prouve pas la performance à grande
échelle ni la justesse des croyances propagées.
