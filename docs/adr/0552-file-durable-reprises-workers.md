# ADR 0552 — File durable des reprises de workers

- **Statut** : Implémenté
- **Portée** : file de reprise des workers dans le backend et migration SQLite associée
- **Décision** : conserver la `Map` de processus comme cache de coordination, avec SQLite comme source durable des reprises en attente.

## Contexte

La file `pendingWorkerRecoveries` ne survit pas à l'arrêt du processus. Une panne entre la décision de reprise et le dispatch perd donc le travail. Elle ne permet pas non plus de distinguer durablement une reprise réclamée, annulée ou épuisée.

## Décision

Chaque reprise reçoit une clé idempotente dérivée de la mission, du worker, de la tentative et de la catégorie. La table `worker_recovery_queue` conserve le payload de reprise et les états `queued`, `claimed`, `retry`, `cancelled`, `exhausted` et `dispatched`. Le dispatch réclame une ligne par mise à jour conditionnelle; une reprise non terminale peut être rechargée après redémarrage. L'annulation termine les lignes en attente ou réclamées. Les nouvelles tentatives restent limitées par `MAX_RECOVERY_DISPATCH_ATTEMPTS`.

Les payloads persistés excluent les champs dont le nom indique un secret, un jeton, une autorisation ou un bail. Les capacités et leases sont reconstruits au moment du dispatch.

## Conséquences

- La file peut reprendre après redémarrage et déduplique les notifications répétées.
- Une ligne annulée ou épuisée n'est pas réclamée de nouveau.
- L'état en mémoire ne remplace plus l'enregistrement SQLite.
- La migration `109-worker-recovery-queue` crée la table et son index de lecture.

## Vérification

Les tests ciblés de reprise couvrent l'idempotence, la réclamation, l'annulation, les retries et la reprise depuis SQLite.
