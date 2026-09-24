# ADR 0074 — Classification des défaillances de symbiontes

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, santé, résilience, gouvernance
- **Décideurs** : GenOS
- **Lié à** : ADR 0060, ADR 0061, ADR 0073

## Contexte

Les interventions sur les symbiontes doivent dépendre de la cause observée. Une
mesure globale de performance ne distingue pas une défaillance de compétence, un
risque d'intégrité ou une dépendance excessive.

## Décision

Le classificateur traite les signaux bornés et les références de preuve pour détecter
les classes `INCOMPETENT`, `STALE`, `OVERCONFIDENT`, `RESOURCE_HUNGRY`,
`CONTRACT_VIOLATING`, `COMPROMISED`, `PATHOBIOTIC`, `REDUNDANT` et `DEPENDENCY_RISK`.
Les atteintes d'intégrité et les violations explicites ont priorité. Une observation
sans seuil de défaillance ne produit aucune classe.

Chaque classe retourne des réponses recommandées distinctes. Ce sont des
recommandations, pas des actions directes : l'application reste soumise au service
de sanctions, aux preuves, à AEIS et aux gates d'autorité.

## Conséquences

### Positives

- Les causes de défaillance et leur priorité sont explicites et auditables.
- La classification ne contourne ni l'autorisation ni l'immunité.

### Négatives

- Les seuils doivent être calibrés par les producteurs des signaux.
- Un facteur absent n'est pas inféré depuis un autre signal.

## Alternatives

- Appliquer directement une sanction : rejeté, car la classification ne remplace pas
  les gates de décision et les preuves exigées par la gouvernance.
