# ADR 0257 — Self-Twin causal versionné et écarts prédictifs

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Self-Twin, causalité, GVX, AGOW
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0007, ADR 0014, ADR 0248, ADR 0256

## Contexte

Les organes du runtime n'avaient pas de modèle causal versionné que le système puisse
interroger avant une intervention puis confronter aux observations. Une représentation
non persistée ou des liens présentés comme des faits mesurés induiraient une confiance
injustifiée.

## Décision

Le Self-Twin conserve son graphe canonique comme manifeste de relations structurelles
hypothétiques. Le ledger GVX conserve les prédictions, observations et écarts comme
événements `evidence_attached` immuables et chaînés. LadybugDB peut recevoir une projection
du manifeste; le fallback SQLite ne prétend pas persister ces nœuds arbitraires.

Une prédiction sans références d'évidence est classée `prior_model` et porte une forte
incertitude initiale. La comparaison ne calcule un écart que pour des métriques fournissant
des valeurs prédites et observées. Un écart positif engendre un candidat AGOW typé
`self_twin_prediction_error`, soumis à revue; il ne change aucun composant et n'est pas
promu automatiquement.

Toute intervention exige un exécuteur fourni par l'intégration appelante. Celui-ci reçoit
un contexte et un budget bornés par l'appelant et doit retourner des observations. Le
service Self-Twin ne modifie pas directement le runtime actif.

## Conséquences

### Positives

- Les prédictions et leurs erreurs sont versionnées dans le ledger GVX vérifiable.
- Les hypothèses structurelles sont distinctes des constats empiriques.
- Les erreurs peuvent alimenter AGOW avec une provenance causale retraçable.
- La projection Ladybug demeure remplaçable et non autoritaire.

### Négatives

- Les effets prédits restent prudents tant que des observations comparables ne les calibrent pas.
- Le graphe de départ décrit une topologie limitée aux organes connus du runtime.
- L'intégration appelante doit fournir l'exécuteur isolé et les références d'évidence.

## Alternatives

- Traiter les liens de dépendance comme des effets causaux établis : rejeté, faute de données
  d'intervention.
- Persister dans le fallback SQLite des tables de graphe propres au Self-Twin : rejeté, car
  le dépôt réserve SQLite canonique à son ledger et considère le graphe comme projection.
- Exécuter automatiquement les interventions : rejeté, car le service n'a pas l'autorité
  pour désactiver ou modifier le runtime actif.
