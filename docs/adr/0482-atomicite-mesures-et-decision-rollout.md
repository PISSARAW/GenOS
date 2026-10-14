# ADR 0482 — Atomicité entre mesures et décision de rollout

- **Statut** : Accepté et implémenté.
- **Date** : 2026-10-14
- **Domaine** : Rollouts, métriques et gate de promotion de release.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0481, autorité et reçu des overrides de production ; ADR 0478, réservation atomique des opérations HTTP.

## Contexte

L'ingestion de métriques lisait le statut du rollout avant de mettre à jour les
agrégats et le ledger. La décision SLO lisait ces agrégats avant d'ouvrir sa
transaction. Une écriture concurrente pouvait donc arriver entre le calcul et
la clôture : la décision s'appuyait sur un échantillon périmé, tandis que la
métrique pouvait être enregistrée comme acceptée après que le rollout soit
devenu terminal.

## Décision

L'ingestion vérifie le statut, met à jour l'agrégat et écrit l'entrée de coûts
dans une transaction `BEGIN IMMEDIATE`. La décision relit le statut et les
métriques dans une transaction du même type, puis applique ensemble le statut
terminal du rollout et l'état de la release. Une décision déjà terminale ne peut
pas être recalculée. Toute métrique reçue après clôture est refusée.

## Conséquences

### Positives

- Le calcul SLO correspond à un instant cohérent des métriques persistées.
- L'agrégat, le ledger de coûts et l'état du rollout ne peuvent pas diverger à
  cause d'une écriture concurrente.
- Une métrique tardive ne peut pas être présentée comme acceptée après promotion
  ou rollback.

### Négatives

- Les écritures et décisions d'un même rollout sont sérialisées par SQLite.
- Une requête de métrique arrivée après la clôture doit être renvoyée par le
  producteur au cours d'un nouveau rollout si elle reste pertinente.

## Alternatives

- Conserver les lectures hors transaction et conditionner seulement l'UPDATE au
  statut : rejeté, car l'agrégat pourrait encore être calculé depuis une vue
  antérieure aux mesures acceptées.
- Recalculer le SLO après la transaction sans sérialiser l'ingestion : rejeté,
  car une deuxième course subsisterait entre le recalcul et la clôture.

## Vérification

`node backend/tests/test_release_operations.js` vérifie le rollout nominal,
refuse les métriques tardives et empêche le recalcul d'une décision terminale.
`node backend/tests/test_release_promotion_truthfulness.js` conserve le contrôle
du refus quand une mutation de release ne modifie aucune ligne.
