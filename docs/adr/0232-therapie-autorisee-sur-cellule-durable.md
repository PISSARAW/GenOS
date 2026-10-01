# ADR 0232 — Thérapie autorisée sur cellule durable

## Contexte

La persistance clinique Node ne prouvait pas une application sur cellule Rust.

## Décision

L'API émet une autorisation HMAC après accord explicite d'un administrateur
authentifié, dans le tenant de la mission. Elle lie cellule, génome/fingerprint,
état attendu, reçu source, thérapie exacte, approbateur et expiration. Rust
vérifie ces liens avant d'appliquer la primitive sur un clone, puis écrit
état et reçu dans un même batch durable avant de publier la mutation en mémoire.
Le CLI accepte journal et fichier d'autorisation confinés au workspace.
Les applications répétées du même identifiant sont idempotentes.

## Conséquences

Le secret GENOS_THERAPY_AUTH_SECRET doit être configuré sur les deux runtimes.
La portée reste une mutation de l'état logiciel local, pas un traitement réel.
L'état Node nécessite également une autorisation de mutation explicite signée.
Le journal reste mono-écrivain ; les applications cliniques restent locales
et leur reçu durable n'est pas une confirmation de livraison au backend.

## Alternatives

Un approved:true fourni seul ou une identité d'agent Node ne prouve ni
l'autorité ni la présence de la cellule Rust ciblée.
