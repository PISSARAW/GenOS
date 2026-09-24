# ADR 0077 — Variants du Holobionte comme policies

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, composition, configuration, résilience
- **Décideurs** : GenOS
- **Lié à** : ADR 0052, ADR 0057, ADR 0073, ADR 0075, ADR 0076

## Contexte

Les configurations d'un Holobionte diffèrent selon son rôle. Dupliquer des services
pour chaque variante rendrait les règles de composition difficiles à comparer et à
faire évoluer.

## Décision

Les variants sont des policies déclaratives partageant la même interface :
`analyzeFit`, `configureHost`, `configureAdmission`, `configureResources`,
`configureImmunePolicy`, `configureTransmission`, `configureSuccession` et
`configureStopConditions`. V1 fournit les policies organelle, adaptive microbiome,
immune-critical, local-first et regenerative. Les configurations retournées sont
des copies afin qu'un appelant ne modifie pas la policy enregistrée.

## Conséquences

### Positives

- Les profils sont comparables via une interface uniforme.
- L'adéquation expose les exigences qui ne sont pas satisfaites.
- La configuration reste déclarative et ne contourne aucun service d'exécution.

### Négatives

- L'analyse dépend de la qualité du contexte fourni par l'appelant.
- Les policies décrivent des choix par défaut, pas des preuves de compatibilité.

## Alternatives

- Créer une branche d'exécution distincte par variant : rejeté, car cela dupliquerait
  les contrôles d'admission, d'immunité et de ressources.
