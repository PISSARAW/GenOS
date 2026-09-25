# ADR 0101 — Détection de sur-réaction immunitaire Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Holobionte, immunité, gouvernance
- **Décideurs** : GenOS
- **Lié à** : ADR 0057, ADR 0097

## Contexte

Des symbiontes fiables peuvent être bloqués à répétition alors que des vérifications
indépendantes confirment la sûreté de leurs résultats. Il faut signaler cette
sur-réaction sans transformer l'historique de confiance en exemption immunitaire.

## Décision

Le détecteur agrège les résultats sûrs confirmés, les décisions de blocage et le
niveau de confiance de chaque symbionte. À partir de trois faux positifs documentés,
il signale un soupçon d'auto-immunité et demande une revue de policy. Le service
n'autorise aucun contournement de gate et ne change pas automatiquement la policy.
Les résidents `TRUSTED` restent soumis à la revue comme les autres.

## Conséquences

### Positives

- Une série de faux positifs devient observable et liée à ses preuves.
- Une revue peut distinguer une immunité trop stricte d'un résultat réellement dangereux.
- Aucun résultat bloqué n'est promu par cette alerte seule.

### Négatives

- L'alerte dépend de verdicts indépendants confirmés.
- Le seuil nécessite une revue adaptée au contexte pour éviter les conclusions hâtives.

## Alternatives

- Exempter les symbiontes de confiance : rejeté, car la confiance passée ne neutralise pas un risque présent.
- Modifier automatiquement les gates : rejeté, car cela rendrait l'alerte elle-même autorité de promotion.
