# ADR 0435 — Lier le daemon résident au plan Métapopulation

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : Métapopulation, variant `persistent`, vérification

## Contexte

Le runtime régional planifie `REGISTER_RESIDENT_DAEMON` avec un `demeId` et
un `daemonId`. Le vérificateur relisait un bail actif pour le dème et le
daemon indiqués par le reçu, ainsi que le chemin du workspace. Il ne
comparait pas ce daemon avec celui demandé par le plan. Un reçu correspondant
à un autre daemon valide du même dème pouvait donc valider l'action planifiée.

Le `workspaceOwnerId` stocké sur le dème n'est pas nécessairement le
`daemonId` : une capsule créée depuis `sourceRoot` reçoit sa propre identité.
Comparer ces deux champs aurait rejeté des workspaces légitimes.

## Décision

VERIFY exige désormais l'égalité de `daemonId` et `demeId` entre le plan et
le reçu avant de relire le bail actif dans la session. Il conserve la
comparaison du chemin du workspace. Un `daemonId` absent du plan est refusé.
Le test couvre un reçu de bail valide du bon dème qui annonce un daemon
différent de celui planifié, ainsi que le cas nominal.

## Limite

Cette vérification lie l'action régionale aux données persistées. Elle ne
prouve ni qu'un processus daemon tourne, ni la restauration d'un workspace
après panne, ni la propriété d'un système externe. Ces garanties demandent
une attestation de l'exécuteur et un protocole de reprise distincts.
