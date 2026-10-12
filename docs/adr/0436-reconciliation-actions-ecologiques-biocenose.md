# ADR 0436 — Réconcilier les actions écologiques incertaines de Biocénose

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Biocénose, actions externes, reprise
- **Lié à** : [ADR 0333](0333-biocenose-cycle-persistant-et-finalisation.md)

## Contexte

Le runtime journalise `ECOLOGICAL_ACTION_STARTED` avant l'appel à un adaptateur
externe. Si l'effet se produit puis que le processus s'arrête ou perd son reçu,
la reprise retrouvait le jugement, mais rappelait l'adaptateur. La même clé
d'idempotence ne garantit pas que l'adaptateur externe déduplique l'effet.

## Décision

Pour une clé ayant un événement de début sans événement de fin, la reprise
refuse la réexécution et renvoie `BIOCENOSE_ACTION_OUTCOME_UNCERTAIN`. Un
`actionReceiptResolver` optionnel peut seulement rechercher le résultat déjà
produit. Son reçu doit satisfaire le même contrat que celui d'une exécution
normale : statut vérifié, communauté, action et clé d'idempotence exactes,
avec acceptation par `isTrustedActionReceipt` ou `isTrustedReceipt`. Le reçu
accepté crée un unique événement `ECOLOGICAL_ACTION_COMPLETED` relisible.

## Limites et vérification

Sans résolveur ou reçu vérifiable, l'action reste bloquée et nécessite une
intervention. Le contrat n'atteste pas à lui seul l'effet externe ni la
fiabilité du vérificateur fourni par l'hôte. Le test de complétion couvre une
perte de reçu après appel, le refus du rejeu, un reçu étranger et la
réconciliation sans second appel à l'adaptateur.
