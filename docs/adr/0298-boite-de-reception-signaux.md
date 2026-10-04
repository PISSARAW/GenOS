# ADR 0298 — Boîte de réception des signaux

- Statut : accepté
- Date : 2026-10-04
- Domaine : Signal Plane, livraison, contrôle d'accès

## Contexte

Les abonnements, lectures et accusés de réception existaient dans les services,
mais aucun client HTTP ne pouvait exploiter tout le cycle. La lecture des signaux
excluait aussi les livraisons déjà effectuées par le worker. Un ACK pouvait
marquer comme traitée une livraison encore en attente.

## Décision

Les routes `/api/signals/subscriptions`, `/api/signals/inbox/:agentId` et
`/api/signals/deliveries/:signalId/ack` exigent une permission de gestion et un
périmètre organisation/projet explicite. L'agent visé doit appartenir au projet.
La boîte de réception réunit les signaux livrés ou vus et les diffusions sans
livraison préexistante. Le passage à `seen` est inscrit avant la réponse.
Un ACK ne réussit qu'à partir de `delivered` ou `seen`, avec un émetteur dans
le même périmètre. Une livraison `pending` demeure disponible au worker.

## Conséquences

La consultation ne revendique pas les livraisons en attente. Les ACK répétés
renvoient un conflit; aucune réussite n'est inférée de la seule requête HTTP.
Les erreurs de lecture et d'écriture remontent au client au lieu d'être
présentées comme une boîte vide.

## Alternatives

Une lecture directe des livraisons `pending` aurait concurrencé les workers;
elle est écartée.
