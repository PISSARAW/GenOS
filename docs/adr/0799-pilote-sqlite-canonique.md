# ADR 0799 — Pilote SQLite canonique

- **Statut** : Accepté
- **Date** : 2026-11-15
- **Domaine** : persistance, installation, compatibilité
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0797](0797-profils-dependances-et-capacites-optionnelles.md)

## Contexte

Le backend chargeait simultanément `sqlite`, `sqlite3` et `better-sqlite3` en
production. Le contrôle principal utilisait l'API asynchrone `sqlite`/`sqlite3`,
tandis que les journaux protocolaires exigeant des transactions synchrones
utilisaient directement `better-sqlite3`. Cette séparation multipliait les modules
natifs, les formes de résultats et les points d'ouverture des bases.

Les tests historiques utilisent encore directement `sqlite` et `sqlite3`. Leur
migration intégrale ne doit pas conditionner la réduction du runtime de production.

## Décision

`better-sqlite3` devient l'unique pilote SQLite de production. La frontière
`backend/src/db/sqliteDriver.js` expose :

- le constructeur synchrone canonique pour les journaux protocolaires ;
- une façade asynchrone compatible avec `run`, `get`, `all`, `exec` et `close` ;
- les constantes d'ouverture nécessaires aux lecteurs historiques ;
- l'instance native pour `sqlite-vec`, les sauvegardes et les transactions.

Les trois étapes de migration sont :

4. introduire la frontière et qualifier ses résultats, sauvegardes, lectures seules
   et extension vectorielle ;
5. faire passer tous les imports de production par cette frontière ;
6. déplacer `sqlite` et `sqlite3` en dépendances de développement, puis interdire
   leur réintroduction dans `backend/src` et `backend/bin` par un test exécutable.

Le profil `full` conserve les deux anciens paquets pour les tests. Le profil `core`,
qui omet les dépendances de développement, n'installe plus qu'un pilote SQLite de
production, accompagné de `sqlite-vec`.

## Conséquences

- Les consommateurs conservent leur contrat asynchrone sans réécriture massive.
- `run` normalise `lastID`, `lastInsertRowid` et `changes`.
- Les protocoles synchrones gardent leurs transactions atomiques existantes.
- Une nouvelle dépendance directe à un pilote SQLite hors de la frontière échoue en
  test.
- `sqlite` et `sqlite3` ne pourront être supprimés totalement qu'après migration des
  fixtures et tests qui les importent encore directement.

## Alternatives

- Conserver deux pilotes runtime : écarté, car cela maintient le coût natif et deux
  sémantiques d'accès.
- Convertir immédiatement tous les protocoles vers une API asynchrone : écarté, car
  cela élargit inutilement le risque transactionnel.
- Migrer toutes les fixtures avant le runtime : écarté, car les dépendances de test
  n'alourdissent pas le profil `core`.
