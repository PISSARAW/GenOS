# ADR 0291 — Persistance du daemon de métapopulation

- **Statut** : Accepté
- **Date** : 2026-10-03
- **Décideurs** : GenOS

## Contexte

Le runtime `persistentRuntimeService` conservait l'identité, l'expiration et la
version du daemon dans une `Map` du processus Node. Malgré son nom, une
redémarrage effaçait cet état ; deux métapopulations ayant le même identifiant de
deme pouvaient aussi se partager une entrée. Le renouvellement prolongeait la
date en mémoire sans mettre à jour le bail SQLite.

## Décision

Le bail SQLite `daemon_leases`, indexé par métapopulation et deme, devient la
source d'autorité pour l'identité du daemon et sa durée de vie. La migration
ajoute `daemon_id` aux installations existantes. La maintenance relit le bail
et le profil persisté de la deme, refuse une demeure inactive ou un bail expiré,
met à jour le profil, puis renouvelle le bail dans SQLite. Aucun état de cycle
daemon ne dépend d'une variable globale du processus.

## Conséquences

- Une instance runtime neuve peut reprendre un daemon enregistré.
- L'identité du daemon reste liée à son bail et à sa métapopulation.
- Les anciens baux peuvent avoir `daemon_id = NULL` jusqu'à leur prochain
  enregistrement ; ils ne sont pas utilisés comme preuve d'identité.
- La mise à jour du profil et le renouvellement du bail restent deux écritures
  distinctes ; l'expiration est toujours vérifiée avant la maintenance.

## Vérification

Le test de runtime métapopulation vérifie l'identité enregistrée en base et la
maintenance depuis un module runtime rechargé.
