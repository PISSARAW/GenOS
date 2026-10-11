# ADR 0430 — Refuser la transition collective sans snapshot restaurable

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : morphogenèse, transition collective, autorité

## Contexte

Le mode `commit` de Morphogenèse V2 et le magasin de graphes ont été fermés
aux autorisations déclaratives. Un autre chemin restait ouvert :
`transitionEngineService.executeTransition` pouvait modifier le collectif,
appeler des adaptateurs de création ou retrait de workers, puis retourner
`committed: true` sans commit durable. `executeVersionedTransition` ajoutait
un commit AgentGit, mais construisait lui-même un utilisateur
`morphogenesis-runtime` et ne vérifiait pas une décision Rust authentifiée.
Son rollback utilisait `collectiveStateService.createSnapshot`, un anneau de
dix états en mémoire. Cette image ne restaure ni workspace, ni processus,
ni baux, ni budgets externes. `topologySnapshotService.preflightRestore`
retourne actuellement `restorable: false` et un plan `verify-only`.

## Décision

`executeTransition` refuse désormais avant tout snapshot, action ou callback
de persistance. Un plan structurellement valide retourne
`MORPHOGENESIS_TRANSITION_AUTHORITY_UNAVAILABLE`, `committed: false`,
`actionsTaken: []`, sans reçu de rollback. Les plans invalides conservent
leurs erreurs de validation. Des objets fournis par l'appelant, tels que
`authorization.kernelDecision.valid` ou `transitionSnapshot.restorable`,
ne réouvrent pas cette frontière. L'entrée directe `commitTransition`
refuse également la création d'un commit morphologique.

La réévaluation automatique marque ce refus `rejected` avec la raison
`production_authority_unavailable`, plutôt que `rolled_back` : aucune action
n'a été lancée. Les helpers d'état en mémoire restent disponibles pour leurs
usages locaux et les vérifications pures ; ils ne qualifient pas un APPLY de
production. Les autres opérations AgentGit de fossilisation et de branchement
gardent leur propre contrat.

## Réouverture requise

Une nouvelle interface devra vérifier, côté serveur et pour le même plan,
un principal authentifié, une décision Rust et une gouvernance signées ou
autrement attestées, un snapshot durable couvrant tous les domaines modifiés,
la capacité de restauration effectivement testée, puis une écriture CAS et
un reçu durable. Aucun simple booléen de callback ne suffit.
