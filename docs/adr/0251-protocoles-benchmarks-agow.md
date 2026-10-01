# ADR 0251 — Protocoles de benchmarks AGOW comparatifs

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, expérience, mesure d'efficacité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0249, ADR 0250

## Contexte

Les nouvelles couches nécessitent des tâches où leurs effets peuvent différer et des
métriques qui séparent qualité, coût de délibération, contamination hypothétique et
scalabilité. Le runner générique impose déjà snapshot, holdout, protocole et reçu.

## Décision

Ajouter des protocoles nommés pour tâches CTM-compatibles, tâches différentielles GenOS,
automatisation non stationnaire, regret prédictif, contamination contrefactuelle et
échelle des marchés (10, 50, 100, 500, 1000 candidats). Le service exige les cas holdout
correspondant au scénario et les remet au runner expérimental existant avec ses
conditions appariées.

Les résumés ajoutent activations globales, requêtes, broadcasts, réveils LLM, hits
directs/procéduraux/reflexes, décompilations, utilité, tokens, marchés, rappel et taux de
contamination. Ils calculent efficacité de délibération et queries-per-success. Les
protocoles ne téléchargent aucun benchmark ni n'exécutent une campagne automatiquement.

## Conséquences

### Positives

- Le plan des expériences est exécutable avec des manifestes et holdouts apportés par
  l'intégrateur.
- Les métriques exposent les coûts que les ajouts de conscience fonctionnelle doivent
  justifier.

### Négatives

- Les suites de données, environnements et callbacks restent à fournir et qualifier.
- Un résumé descriptif n'est pas une analyse statistique ni une réplication indépendante.

## Alternatives

- Générer des scores de benchmark sans exécuter les tâches : rejeté, car ils donneraient
  des résultats non observés.
