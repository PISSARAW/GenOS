# Classification des défaillances de symbiontes — identifiant historique 0072

- **Statut** : Remplacé — voir ADR 0074
- **Date** : 2026-09-24
- **Domaine** : Holobionte, santé, résilience, gouvernance
- **Décideurs** : GenOS
- **Lié à** : ADR 0060, ADR 0061, ADR 0071

## Contexte

Les interventions sur les symbiontes doivent dépendre de la cause observée. Une
simple mesure globale de performance ne distingue pas une défaillance de compétence,
un risque d'intégrité ou une dépendance excessive.

## Décision

Le classificateur traite les signaux bornés et les références de preuve pour détecter
les classes `INCOMPETENT`, `STALE`, `OVERCONFIDENT`, `RESOURCE_HUNGRY`,
`CONTRACT_VIOLATING`, `COMPROMISED`, `PATHOBIOTIC`, `REDUNDANT` et `DEPENDENCY_RISK`.
L'ordre des règles donne priorité aux atteintes d'intégrité et aux violations
explicites. Une observation sans seuil de défaillance ne produit aucune classe.

Chaque classe retourne des réponses recommandées distinctes. Il s'agit d'une
recommandation de remédiation, pas d'une action directe : l'application reste soumise
au service de sanctions, à ses preuves, à AEIS et aux gates d'autorité.

## Conséquences

### Positives

- Les causes de défaillance sont explicites et auditables.
- L'ordre de priorité est déterministe en cas de signaux concurrents.
- La classification ne contourne ni l'autorisation ni l'immunité.

### Négatives

- Les seuils doivent être calibrés par les producteurs des signaux.
- Un facteur de risque absent n'est pas inféré à partir d'un autre signal.

## Alternatives

- Déduire et exécuter directement une sanction : rejeté, car la classification ne
  remplace pas les gates de décision et les preuves exigées par la gouvernance.
