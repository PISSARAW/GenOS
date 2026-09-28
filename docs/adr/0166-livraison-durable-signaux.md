# ADR 0166 — Livraison durable des signaux entre processus

- **Statut** : Accepté
- **Date** : 2026-09-28
- **Domaine** : Signal Plane, persistance, concurrence, reprise
- **Décideurs** : GenOS Runtime
- **Lié à** : ADR 0163 (contrats de preuve), ADR 0165 (frontière de persistance)

## Contexte

`signal_blobs` et `signal_deliveries` enregistrent déjà les messages destinés aux
agents, mais le réveil ne dépend que de l'EventBus Node local. Un processus
différent ne reçoit pas son émission; en outre, le subscriber marquait la
livraison avant l'exécution du handler. Une panne pouvait donc perdre un réveil
ou annoncer une livraison qui n'avait pas eu lieu.

## Décision

1. Conserver l'EventBus comme chemin push local et ajouter un polling borné des
   livraisons `pending`, depuis SQLite, pour la reprise entre processus.
2. Revendiquer chaque couple signal/destinataire via `signal_delivery_claims` et
   un lease atomique avec propriétaire, échéance, tentatives, backoff et état de
   quarantaine. Une seule instance traite un lease à la fois.
3. Recharger le signal persisté et vérifier son enveloppe et son lien avec la
   ligne avant d'appeler le handler. Une enveloppe absente ou invalide ne réveille
   pas l'agent.
4. Marquer `delivered` après le succès du handler. Réessayer les erreurs avec un
   backoff exponentiel plafonné; mettre en quarantaine les messages invalides et
   les livraisons qui dépassent huit tentatives.
5. La garantie est **au moins une fois**, pas exactement une fois. Les handlers
   doivent donc dédupliquer les effets métier par `signalId`; un crash après
   l'effet et avant l'enregistrement de succès peut provoquer une répétition.

## Conséquences

- **Positives** : une instance qui démarre après publication peut reprendre les
  livraisons; les leases évitent le double traitement concurrent; les erreurs et
  les messages invalides restent inspectables.
- **Négatives** : le polling ajoute une charge SQLite régulière; chaque handler
  doit être idempotent; la quarantaine demande une opération explicite de reprise.
- **Neutres** : l'EventBus reste local et garde sa faible latence; le délai de
  reprise durable nominal est de 500 ms.

## Alternatives

- Redis ou un broker externe : rejeté pour cette étape, car la persistance
  SQLite et le registre de livraison existent déjà.
- Marquer livré avant le handler : rejeté, car une exception ou une panne perd
  silencieusement le réveil.
- Promettre exactement une fois : rejeté, car un crash entre effet métier et
  écriture SQLite ne peut pas être éliminé sans transaction distribuée avec le
  handler.

## Vérification

`backend/tests/test_signal_delivery_claims.js` vérifie l'exclusion des
revendications concurrentes et la reprise après échéance. `backend/tests/test_signal_plane_e2e.js`
vérifie qu'une livraison persistée est reprise sans EventBus local et qu'une
enveloppe vérifiée atteint le handler.
