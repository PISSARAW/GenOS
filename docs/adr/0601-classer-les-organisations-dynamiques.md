# ADR 0601 — Classer les organisations dynamiques dans la morphogenèse

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : morphogenèse, organisations dynamiques, orchestration
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0568, ADR 0570

## Contexte

Le planificateur morphogénétique classait les huit topologies structurelles, mais
une organisation dynamique n'était retenue que lorsqu'un appelant la fournissait
explicitement ou lorsqu'une règle événementielle la proposait. Les dix-neuf
organisations canoniques ne partageaient donc pas un classement comparable fondé
sur les signaux de mission, les capacités disponibles et la topologie sélectionnée.

Cette séparation rendait également possible un plan dont le graphe portait une
organisation sans que son contrat de capacités soit inclus dans les changements
planifiés. Enfin, `strategy_arena` et `competitive_arena` produisaient le même pas
d'organisation malgré des obligations de décision différentes.

## Décision

1. Ajouter un résolveur déterministe qui classe exactement les dix-neuf
   organisations canoniques. Il combine adéquation aux signaux, capacités,
   affinité topologique, domaine, continuité et biais de repli explicite.
2. Conserver la priorité d'une organisation demandée explicitement, tout en
   produisant le classement complet et les capacités manquantes dans le reçu.
3. Recompiler le candidat topologique retenu avec l'organisation choisie afin que
   le graphe, les capacités, les recrutements et les changements de structure
   décrivent la même morphologie.
4. Sceller séparément les classements `topology` et `organization` dans le reçu de
   contrôle. Le plan expose également `candidateOrganizations`.
5. Propager `selectedTopology` et `selectedOrganization` vers le plan de transition
   versionné au lieu de tenter de les reconstruire depuis une forme historique.
6. Distinguer l'arène de stratégies, sélectionnée par Pareto puis promotion, de
   l'arène compétitive, ordonnée par score d'évidence.

Le classement reste une décision de planification. Il ne contourne ni le lease
`genos_change_organization`, ni la quiescence, ni les preuves, ni l'autorité du
commit morphogénétique.

## Conséquences

### Positives

- les dix-neuf organisations sont évaluées par une interface commune ;
- une mission sans organisation imposée obtient un choix reproductible et expliqué ;
- le contrat de capacités couvre simultanément topologie et organisation ;
- le graphe, le reçu et la transition partagent la même identité organisationnelle ;
- les deux arènes ne sont plus des synonymes algorithmiques.

### Négatives

- les poids heuristiques exigent des issues vérifiées avant toute calibration
  empirique ;
- un signal absent vaut zéro et peut favoriser la continuité ou l'organisation de
  repli ;
- le classement n'affirme aucun gain face à une autre organisation sans campagne
  appariée.

## Alternatives

- **Conserver uniquement les déclencheurs événementiels** : rejeté, car la majorité
  des organisations restait invisible à la décision générale.
- **Mélanger topologies et organisations dans un seul catalogue** : rejeté, car ces
  axes ont des sémantiques, des transitions et des contrats distincts.
- **Toujours imposer une organisation par topologie** : rejeté, car cela interdit
  l'adaptation aux signaux de mission et à l'état des capacités.
