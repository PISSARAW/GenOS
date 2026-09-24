# ADR 0069 — Graphe d’interactions des symbiontes Holobionte

## Statut

Accepté — vingtième lot du plan Holobionte.

## Contexte

Les symbiontes coopèrent par des relations variées, qui doivent être
inspectables et prouvées. La communication peut être indirecte ou représentée
par une relation, mais la promotion des résultats appartient au Host.

## Décision

1. Représenter `SUPPLIES`, `VERIFIES`, `TRANSLATES`, `PROTECTS`, `CONSUMES`,
   `COMPETES`, `BACKS_UP` et `INHIBITS` comme arêtes dirigées.
2. Exiger deux résidents, leurs contrats actifs et des preuves pour chaque
   relation explicitement enregistrée.
3. Faire examiner l’arête par AEIS pour les deux symbiontes et par le plan
   mémoire du Host avant de l’ajouter au graphe.
4. Inclure les arêtes `SUPPLIES` déduites des reçus de cross-feeding et
   déclarer explicitement l’autorité de promotion au Host.

## Conséquences

- Les relations conservent leurs contrats et leurs preuves, même lorsque les
  symbiontes ne se transmettent pas directement le contenu.
- Les snapshots peuvent agréger le graphe depuis des mémoires append-only.
- Le graphe décrit les interactions ; il ne confère pas d’autorité de
  promotion ou de permission supplémentaire.

## Alternatives

- Déduire les relations depuis les noms de rôles : rejeté, car un rôle ne
  prouve pas qu’une interaction a eu lieu.
- Laisser le graphe décider quels résultats promouvoir : rejeté, car le Host
  conserve la souveraineté de promotion.
