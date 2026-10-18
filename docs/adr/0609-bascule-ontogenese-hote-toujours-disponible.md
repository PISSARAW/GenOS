# ADR 0609 — Basculer l’Ontogenèse vers un hôte toujours disponible

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : Ontogenèse, continuité, hébergement, fencing
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0235, 0606, 0607 et 0608

## Contexte

Un processus local ne peut ni travailler ni se réveiller quand sa machine est
éteinte. L’autostart traite un redémarrage, pas une extinction. Une continuité
réelle exige donc que le projet, sa base et son contrôleur changent d’hôte avant
l’arrêt, sans que deux contrôleurs puissent produire des effets concurrents.

SQLite n’est pas un ordonnanceur distribué et son fichier WAL ne doit pas être
partagé simultanément par deux machines au moyen d’un système de fichiers réseau.
Le transport du stockage et le provisioning de l’hôte sont des responsabilités
d’exploitation distinctes du protocole d’autorité.

## Décision

GenOS adopte une bascule froide explicite vers un contrôleur appairé :

1. l’hôte cible atteste un identifiant de stockage durable ;
2. la préparation n’est possible qu’en l’absence de claim, d’exécution ou
   d’opération incomplète ;
3. elle scelle un manifeste, une génération monotone et un jeton aléatoire dont
   seul le hash est persisté ;
4. dès cette préparation, aucun tick n’est autorisé jusqu’à l’acceptation ;
5. l’hôte cible accepte une fois le jeton, puis renouvelle un lease à chaque tick ;
6. tout tick portant un autre hôte ou une autre génération est refusé ;
7. l’expiration conduit à `reclaim_required`, jamais à un vol automatique ;
8. une reprise locale explicite par un hôte local appairé incrémente encore la
   génération et invalide définitivement l’ancien contrôleur.

Les changements d’état produisent des reçus append-only. Le jeton de bascule est
remis une seule fois à l’opérateur et transmis par la variable
`GENOS_ONTOGENESIS_HANDOFF_TOKEN`, pas stocké en clair dans la base.

Le stockage durable contenant la base SQLite, ses sidecars et le dépôt doit être
transféré ou remonté **exclusivement** sur l’hôte cible avant l’acceptation. Le
protocole ne copie pas ce stockage et n’affirme pas qu’un montage réseau SQLite
concurrent serait sûr.

## Conséquences

### Positives

- la machine locale peut être arrêtée après acceptation sans arrêter le
  contrôleur hébergé ;
- génération, lease et contrôle du tick ferment le split-brain ;
- les décisions de bascule, expiration et reprise sont auditables ;
- un redémarrage de processus conserve l’autorité active dans SQLite.

### Négatives

- l’opérateur doit fournir un hôte toujours disponible et déplacer le stockage ;
- la bascule attend un point quiescent et ne migre pas un processus en mémoire ;
- une perte de lease exige une reprise explicite, même si elle était transitoire ;
- le protocole ne provisionne ni cloud, ni volume, ni tunnel réseau.

## Alternatives

- **Prétendre que l’autostart couvre l’extinction** : rejeté, aucun code ne
  s’exécute sur une machine éteinte.
- **Partager SQLite en écriture sur un montage réseau** : rejeté, le verrouillage
  et WAL ne constituent pas une base distribuée sûre.
- **Voler automatiquement un lease expiré** : rejeté, un partitionnement réseau
  pourrait alors produire deux contrôleurs actifs.
- **Migrer les processus à chaud** : rejeté pour cette tranche ; les Job Objects
  et handles locaux ne sont pas transportables entre hôtes.

## Preuves

`backend/tests/test_ontogenesis_offline_continuity.js` couvre le jeton à usage
unique, la persistance après réouverture de la base, le refus local, le fencing de
génération, l’expiration et la reprise explicite.
