# ADR 0606 — Socle durable V2 de l’Ontogenèse

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : Ontogenèse, persistance, idempotence, autorité
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [ADR 0235](0235-ontogenese-multi-agents-persistante.md), [ADR 0334](0334-ontogenese-pilotage-reprise-et-retention.md)

## Contexte

La configuration V1 et les tables d’exécution décrivent une boucle persistante,
mais elles ne fournissent pas un registre uniforme des intentions, des effets,
des artefacts et des messages à remettre. Une reprise complète ne peut pas être
fondée sur la seule présence d’un processus ou sur un transport réussi.

## Décision

Introduire une configuration V2 migrée atomiquement et trois registres :

- `ontogenesis_operations`, journal d’intentions à clé d’idempotence et empreinte canonique ;
- `ontogenesis_artifacts`, inventaire des artefacts, de leur rétention et de leur gel ;
- `ontogenesis_outbox`, file durable dédupliquée, sans livraison implicite.

La migration V1 vers V2 refuse toute autorité historique de push ou de fusion.
Les sections `publication` et `merge` restent explicitement désactivées. Les
politiques de durabilité et de rétention deviennent versionnées. La migration
n’effectue aucune copie de la base SQLite.

Les transitions sont comparées à l’état courant et les conflits d’idempotence
échouent. Un transport ou une insertion ne constitue toujours pas une preuve de
validité, de promotion ou d’autorité externe.

## Conséquences

### Positives

- Les effets futurs disposent d’une identité stable et d’un journal inspectable.
- Les artefacts et messages peuvent être repris sans double application silencieuse.
- Une configuration historique ambiguë échoue au lieu d’élargir l’autorité.

### Négatives

- Le socle seul ne livre aucun message et ne purge aucun fichier.
- Les producteurs doivent raccorder explicitement leurs effets au journal.

## Alternatives

- Déduire les effets depuis les logs : rejeté, car les logs ne sont ni atomiques ni exhaustifs.
- Réutiliser uniquement `ontogenesis_execution` : rejeté, car il ne couvre ni artefacts ni outbox.
- Autoriser push et fusion dans V2 : rejeté, car cette autorité reste volontairement hors périmètre.

## Validation

`node backend/tests/test_ontogenesis_durable_foundation.js`
