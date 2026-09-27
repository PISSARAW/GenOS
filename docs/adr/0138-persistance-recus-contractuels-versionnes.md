# ADR 0138 — Persistance transactionnelle des reçus contractuels versionnés

## Statut

Accepté.

## Contexte

Les contrats versionnés du lot 02 étaient validés en mémoire, mais leur
persistance et la notification des projections n’étaient pas atomiques. Une
reprise pouvait donc perdre le reçu, dupliquer l’événement ou restaurer une
charge différente sous le même identifiant.

## Décision

Ajouter une table `versioned_contract_receipts` avec hash du payload, version,
provenance et contrainte d’unicité. L’écriture du reçu et de son événement
`projection_events` se fait dans une transaction SQLite unique. Une seconde
écriture du même reçu est idempotente; un identifiant réutilisé avec un autre
payload est refusé. La restauration relit le JSON stocké et repasse par le
validateur du lot 02.

## Conséquences

Les projecteurs existants consomment les événements sans nouveau protocole.
Les conflits de contenu sont détectés avant promotion et les événements sont
rejouables par leur identifiant déterministe. Le hash est celui du JSON
produit par le service de contrats; une canonisation plus riche sera un
changement de contrat explicite.
