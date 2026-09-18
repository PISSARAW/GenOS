# ADR 0022 — Promotions de maturité des stratégies

- **Statut** : Accepté
- **Date** : 2026-09-18

## Décision

Une stratégie passe de `experimental` à `implemented` uniquement lorsque ses
primitives sont enregistrées, que le registre les expose comme `ready` et que
les contrats continuent d'imposer les preuves, l'isolation, les budgets et les
gates de promotion.

La promotion ne supprime jamais l'abstention ni la vérification indépendante.
Les capacités à effet destructif restent traitées dans une release séparée
avec approbation humaine et rollback explicite.

## Conséquence

`maturity` décrit la stabilité opérationnelle du contrat GenOS, pas la validité
d'une métaphore biologique ni une garantie de production universelle.
