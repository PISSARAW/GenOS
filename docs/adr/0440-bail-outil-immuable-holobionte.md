# ADR 0440 — Rendre le bail d'outil immuable jusqu'à l'invocation Holobionte

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Holobionte, variant `tool`, autorité d'invocation
- **Lié à** : [ADR 0420](0420-frontiere-contrat-outil-holobionte.md)

## Contexte

Le variant `tool` émet un bail temporaire après avoir vérifié le résident et le
contrat. Le runtime vérifie sa date avant d'invoquer le callback, puis la
frontière relit le contrat de façon asynchrone. Le bail pouvait expirer pendant
cette lecture. Son objet exposé au runtime pouvait aussi être modifié pour
repousser artificiellement l'échéance.

## Décision

Le bail émis est figé. Sa vérification exige à la fois son identité et une
échéance future. Après la relecture du contrat actif et de sa révision, la
frontière contrôle encore l'échéance immédiatement avant l'appel à
l'exécuteur. Une expiration refuse l'appel avec
`HOLOBIONT_TOOL_LEASE_EXPIRED`.

## Conséquences

Une lecture lente du contrat ne permet plus d'invoquer un outil sous un bail
expiré. Le callback n'est pas appelé sur ce refus ; l'effet externe d'une
invocation déjà commencée reste soumis aux reçus et au statut
`UNKNOWN_EFFECT`. La garantie repose sur l'horloge du processus et ne prouve
ni une sandbox système ni l'effet réel de l'outil.

## Alternatives

Prolonger automatiquement le bail pendant la lecture aurait étendu
l'autorité sans nouvelle décision de contrat. La frontière conserve une durée
fixe et oblige à obtenir une nouvelle autorisation après expiration.
