# ADR 0301 — Expiration des buffers de signaux

- Statut : accepté
- Date : 2026-10-04
- Domaine : Signal Plane, anti-spam, mémoire

## Contexte

Le premier signal d'une fenêtre était publié puis conservé dans le buffer.
Les signaux suivants étaient supprimés avec `published: false`. Sans nouveau
signal après 500 ms, le buffer persistait indéfiniment en mémoire. Un signal
ultérieur pouvait agréger et republier le premier signal déjà émis.

## Décision

Le buffer expire automatiquement à la fin de sa fenêtre et le timer est
annulé lors d'une purge explicite. Un nouveau signal après l'échéance ouvre
une nouvelle fenêtre avec son seul contenu. La valeur zéro désactive
effectivement la période réfractaire pour les appels qui la choisissent.

## Conséquences

Un signal supprimé n'est jamais présenté comme publié et un signal déjà émis
ne réapparaît pas dans une émission agrégée ultérieure. L'API locale permet
toujours une inspection ou agrégation manuelle avant expiration.

## Alternatives

Un vidage automatique créerait une publication différée qui nécessite un
registre durable, une identité de signal nouvelle et une validation de son
enveloppe; ce changement n'est pas confondu avec la suppression anti-spam.
