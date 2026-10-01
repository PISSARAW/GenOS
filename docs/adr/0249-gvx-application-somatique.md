# ADR 0248 — Application somatique GVX sous autorisation externe

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, adaptation somatique, rollback

## Contexte

Le lot 5 évalue les candidats somatiques, mais ne raccorde pas encore cette
décision au cycle d'application d'un runtime. L'application doit rester sous
autorité du plan de contrôle et sa persistance ne peut précéder la mutation.

## Décision

Fournir une orchestration qui requiert deux adaptateurs explicites : une
autorité de contrôle qui décide chaque application et rollback, et un runtime
qui applique le changement et fournit ses empreintes parent/candidate et son
jeton de restauration. L'orchestrateur refuse les adaptateurs absents, les
refus, les reçus sans empreinte parentale ou sans jeton, et les restaurations
qui ne retrouvent pas le hash parent.

Après application, un reçu est ajouté au registre GVX. Si l'écriture échoue,
l'orchestrateur tente une compensation runtime et conserve l'erreur initiale.
Les rejeux d'un `applicationId` renvoient le reçu existant. Les rollbacks ont
leur propre décision d'autorisation et produisent un événement append-only,
y compris en cas d'échec de restauration.

## Conséquences

- Le contrat explicite le raccordement et les compensations sans donner à GVX
  le contrôle de l'autorité ou du runtime.
- Aucun runtime concret n'est branché; le lot reste partiel.
- Le plan de contrôle doit vérifier l'éligibilité du candidat dans son
  implémentation de `authorize`, hors du périmètre GVX.

## Alternatives considérées

- Autoriser l'application à partir d'un simple statut de recommandation :
  rejeté, car il ferait d'une évaluation GVX une autorisation.
- Écrire le reçu avant la mutation : rejeté, car un crash pourrait déclarer
  appliqué un changement qui ne l'est pas.
