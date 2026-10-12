# ADR 0395 — Mémoire autobiographique individuelle et résultats vérifiés

## Contexte

Les épisodes portent un `agent_id`, mais les leçons consolidées étaient regroupées seulement par type, stratégie et tenant. Un autre agent pouvait donc rappeler une leçon qui ne provenait pas de son expérience. Les événements natifs émettent une preuve locale avant que le contrôle de complétion et de promotion ait tranché.

## Décision

- Une leçon autobiographique est attribuée à un agent. Son identité, sa clé de regroupement et sa requête de rappel incluent `agent_id`, en plus du tenant. Les leçons historiques sans agent restent en base pour audit et ne sont pas automatiquement réattribuées.
- Un épisode conserve la provenance de son événement. Une preuve d'artefact natif est validée avec le contrat du worker avant de contribuer à la saillance. Une fin locale suivie d'un refus de promotion ne devient pas une mission acceptée.
- Les statuts de résultat destinés à la consolidation sont canoniques et distincts des statuts de transport. Une fin locale non vérifiée n'est pas comptée comme succès consolidable. Une complétion ne devient un succès d'apprentissage que si l'exécution persistée est `completed` et liée au même agent. Un refus d'oracle pour domaine indisponible ou budget expiré est `blocked` : il reste auditable sans enseigner à tort l'échec d'une stratégie.
- Deux observations opposées (un succès et un échec) ne suffisent pas à créer une leçon. Deux résultats dominants sont nécessaires. Une leçon de succès vérifié augmente modérément la tolérance au risque et la confiance lors du rappel ; un échec répété accroît la prudence.
- Le contrôle de promotion et les reçus indépendants ne sont ni simulés ni désactivés pour les tests de mémoire.

## Conséquences

La migration ajoute `agent_id` aux leçons existantes sans perdre les lignes historiques. Les lectures individuelles ne retournent que les leçons du même agent. Les tests end-to-end doivent refaire plusieurs missions avec **la même identité**, consolider, redémarrer, puis comparer avec un agent témoin. Un transfert de leçon entre agents demandera une opération explicite avec provenance, distincte de la mémoire autobiographique.
