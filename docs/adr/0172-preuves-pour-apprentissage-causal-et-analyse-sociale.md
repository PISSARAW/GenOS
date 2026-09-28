# ADR 0172 — Preuves pour l'apprentissage causal et analyse sociale descriptive

- **Statut** : Accepté
- **Date** : 2026-09-28
- **Domaine** : Apprentissage, expérimentation causale, cognition sociale
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0171

## Contexte

Les résultats déclarés par un worker ne suffisent pas à entraîner les stratégies
et les topologies. Les campagnes causales répliquées pouvaient aussi continuer
après annulation. Enfin, l'analyse sociale devait comparer les sources sans
attribuer de fiabilité ni déduire de vérité.

## Décision

La boucle causale n'apprend la qualité que depuis un reçu de vérificateur
indépendant, signé et lié au résultat. Sans ce reçu, les déclarations restent
visibles comme déclarations, mais ne modifient ni les priors, ni les stratégies,
ni la mémoire consolidée.

Une campagne causale répliquée vérifie le signal d'annulation entre les bras et
les paires; une campagne interrompue échoue sans reçu partiel. L'analyse sociale
expose la couverture des sujets par source, refuse les incertitudes mal
formées et ne confère aucune autorité d'exécution ou de promotion.

## Conséquences

### Positives

- Les retours non vérifiés ne contaminent pas l'apprentissage durable.
- L'annulation ne peut pas produire un reçu donnant l'apparence d'une campagne
  complète.
- La comparaison des sources reste descriptive et traçable.

### Négatives

- L'apprentissage de qualité est suspendu quand aucun vérificateur de confiance
  ne produit de reçu valide.
- La couverture partagée ne mesure pas l'exactitude ni la fiabilité des sources.

## Alternatives

- Utiliser la qualité déclarée comme approximation : rejeté, car elle permettrait
  au producteur de s'auto-évaluer.
- Transformer le graphe social en score de confiance ou en autorisation : rejeté,
  car une relation déclarée n'est ni une preuve ni une permission.
