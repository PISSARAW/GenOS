# ADR 0374 — Registre durable des domaines Garage

- **Statut** : Accepté pour la tranche SQLite locale
- **Date** : 2026-10-10
- **Domaine** : Garage Fabric, capacité, sous-orchestration
- **Décideurs** : maintenance GenOS
- **Lié à** : [ADR 0312](0312-garage-fabric-adaptatif.md), [ADR 0353](0353-delegation-worker-bornee-et-admission-runtime.md), [ADR 0372](0372-fondation-garages-hierarchiques-et-plafond-projet.md)

## Contexte

Le Garage existant possède une file et des limites par parent et projet, mais
aucun objet durable ne représente un garage comme domaine d'autorité. Une
hiérarchie ne peut pas être déduite d'un simple mode de stationnement. Un
second compteur de places actives risquerait aussi de diverger de l'état des
workers et de leurs claims après un crash.

## Décision

`garage_domains` enregistre un manager par domaine, son parent, sa racine, son
workspace et son périmètre organisation/projet. La première admission en file
ou réservation d'un worker enregistre la chaîne de managers dans une
transaction SQLite. Un manager worker doit être un `sub_orchestrator` déjà
persisté ; ce registre ne lui accorde aucun droit de délégation nouveau.

Le binding parent/racine/périmètre est immuable. Une tentative de déplacer le
manager, de changer de tenant, de former un cycle ou de dépasser 32 niveaux
est refusée. Le nombre de niveaux enregistrables n'augmente pas la profondeur
de délégation actuellement autorisée par les contrats worker.

Chaque domaine conserve un plafond de file (`queue_capacity`) et un plafond
local de workers actifs (`active_capacity`). L'admission utilise ces valeurs ;
une baisse de la configuration active reste applicable par la borne la plus
restrictive. Une hausse ultérieure de configuration ne relève pas
automatiquement le plafond déjà persisté. La file garde sa limite initiale de
1 000 demandes lors du premier enregistrement.

La vue `garage_active_reservations` projette les places `active_worker` depuis
les états durables des agents et de `garage_queue`. Elle n'ajoute pas un
deuxième journal de réservation susceptible de diverger. Le contrôle projet
de l'ADR 0372 et la transaction de réservation existante restent l'autorité
pour le plafond partagé. La vue couvre les domaines enregistrés ; elle ne
prétend pas inventorier rétroactivement tous les managers historiques.

Une migration additive `116-garage-domains` met à niveau les bases ayant déjà
exécuté la migration Garage initiale. Les nouveaux environnements créent la
même structure pendant leur migration Garage, de manière idempotente.

## Invariants et validation

1. Deux connexions enregistrant simultanément un manager obtiennent un seul
   binding durable.
2. Le même manager ne peut pas être relié ensuite à un autre parent ou tenant.
3. Le plafond local persisté borne la réservation ; le plafond de file borne
   les nouvelles demandes.
4. Une place libérée disparaît de la projection active sans second compteur.
5. La complétion d'un run requiert toujours les preuves Garage existantes.

`backend/tests/test_garage_domains.js` couvre ces cas avec SQLite réel et une
seconde connexion. Il ne constitue pas un benchmark de débit.

## Conséquences

### Positives

- Une structure parent/racine est persistée sans modifier les 12 modes Garage.
- Les plafonds locaux sont relus après redémarrage et utilisés à l'admission.
- La projection des places actives suit les états durables déjà clôturés.

### Limites

- Les ressources GPU, RAM, stockage, fournisseur et tokens ne reçoivent pas
  encore de réservation globale dans ce registre.
- Les domaines ne se répartissent pas entre hôtes ou bases SQLite.
- Les anciens managers sans admission récente ne figurent pas dans la vue.
- Un changement de plafond persisté demande encore un parcours opérateur
  versionné ; le registre n'expose pas ici d'API de reconfiguration.

## Alternatives

1. **Créer un compteur actif indépendant** : rejeté pour cette tranche, car
   les transitions de run, de freeze et d'arrêt pourraient le désynchroniser.
2. **Dériver la hiérarchie du mode `tower`** : rejeté ; ce mode règle une voie,
   pas les relations d'autorité.
3. **Distribuer immédiatement le registre** : différé jusqu'aux mesures de
   contention et aux garanties de fencing inter-hôtes.
