# ADR 0071 — Morphogenèse fractale et contrôle local

- Statut : Accepté
- Date : 2026-09-24
- Domaine : Orchestration, morphogenèse, autorités déléguées

## Contexte

Le plan morphologique était centralisé. Les sous-orchestrateurs ne pouvaient pas
adapter une partie bornée du graphe, et les signaux de pression immédiate et de
dette structurelle risquaient d'être traités comme un même déclencheur.

## Décision

Les changements locaux sont autorisés par un bail typé et expirant. Le bail borne
les nœuds, opérateurs, topologies, frontières d'état, autorité et budgets. Toute
mutation globale reste réservée à l'orchestrateur principal. Une transition
locale passe par le même cycle transactionnel, avec restauration des graphes,
workers, baux, état et budgets en cas d'échec.

Le contrôle sépare les actions rapides, structurelles et évolutives. Les réparations
essaient la région la plus petite, puis le parent, puis la transformation globale.
Le stress immédiat, la dette structurelle et la nécessité contrefactuelle sont
mesurés par des services distincts.

## Conséquences

- La délégation locale ne confère pas d'autorité globale.
- Les demandes doivent fournir un graphe de confiance, des coûts et des cibles
  compatibles avec leur bail.
- Les seuils des signaux sont des politiques configurables à calibrer par les
  métriques et benchmarks dédiés.
- L'intégration dépend des adaptateurs de transition injectés; les services
  ne prétendent pas fournir eux-mêmes un ordonnanceur distribué.
