# ADR 0615 — Comparaisons exécutées des organisations philosophiques

- Statut : Accepté
- Date : 2026-10-18
- Domaine : philosophie opérationnelle, organisations, expérimentation, preuve
- Lié à : [ADR 0609](0609-missions-representatives-philosophie.md)

## Contexte

Les missions représentatives exécutent des corrections appariées, mais leur
ordonnancement direct ne compare pas les effets de plusieurs organisations.

## Décision

Exécuter chaque mission sous quatre ordonnanceurs en processus : centralisé,
fédéré, pair-à-pair et critiques isolés. Tous reçoivent les mêmes contrats,
observations et plafonds. Chaque ordonnanceur produit une trace réelle de ses
messages, son ordre de tâches, ses tours, ses coûts et l'empreinte de son issue.

Le reçu exige la parité des budgets et des issues, puis rejoue les seize
exécutions organisationnelles. Il refuse toute altération ou auto-promotion.

Cette phase démontre l'exécution de quatre organisations dans le processus
Node. Elle ne lance pas de workers ni de topologies distribuées et conserve
`actualWorkerDispatch: false`, `actualTopologyExecution: false`,
`independentValidation: false` et `promotionEligible: false`.

## Conséquences

- Les coûts de communication et tours deviennent comparables à tâche constante.
- Les quatre missions produisent seize exécutions organisationnelles rejouables.
- Le dispatch distribué et l'attestation indépendante restent des étapes ultérieures.
