# ADR 0289 — Probes topologiques en lecture seule

## Statut

Acceptée.

## Date

2026-10-03.

## Domaine

Benchmarks de topologie, observation de sessions, preuve de mission.

## Décideurs

Équipe GenOS.

## Lié à

ADR 0278, 0287 et 0288.

## Contexte

Les probes Biome, Syncytium et Rhizome écrivaient dans la session mission après
l'exécution des workers, puis vérifiaient l'état qu'elles venaient de produire.
Des probes de composant synthétiques étaient aussi agrégées dans le même champ
`verified` que les vérifications de mission.

## Décision

Les probes qui observent une session mission sont en lecture seule et déclarent
leur portée comme observation de mécanisme. Les probes composant utilisent une
portée distincte. Aucune probe ne compte comme preuve de réussite missionnelle à
moins d'être explicitement marquée `mission-outcome` et `verificationEligible`.
Les reçus de probes précédemment enregistrés ne sont pas réutilisés pour éviter
qu'une observation fabriquée antérieurement soit prise pour un résultat courant.

## Conséquences

### Positives

- Les probes n'ajoutent plus après coup les opérations qu'elles prétendent
  observer.
- Les contrôles d'API et les résultats missionnels ne partagent plus la même
  autorité de vérification.
- Une incohérence de décision Biome est conservée comme observation invalide.

### Négatives

- Une session qui ne contient pas encore les opérations attendues reste
  diagnostique et échoue à la preuve de mission.

## Alternatives

- Continuer à réparer la session pendant le probe puis vérifier le nouvel état :
  rejeté, car cela ne prouve pas que le worker a réalisé l'action.
- Renommer les probes de composant sans changer l'agrégation : rejeté, car elles
  continueraient à influencer le verdict missionnel.
