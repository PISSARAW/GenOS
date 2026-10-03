# ADR 0290 — Livraison interprocessus des événements au daemon résident

- **Statut** : Accepté
- **Date** : 2026-10-03
- **Domaine** : Daemons résidents, événements, SQLite

## Contexte

Le bridge de production et `genos-daemon.cjs` sont des processus distincts,
mais `signalEventBus` est un `EventEmitter` en mémoire propre à chaque processus.
Le bridge persistait déjà les événements dans `daemon_events`, sans consommateur
résident durable. Un résultat `woke=true` pouvait donc décrire une décision de
politique sans réveil effectivement livré au host.

## Décision

Le journal `daemon_events` devient la source de livraison interprocessus. Chaque
host résident initialise puis avance un curseur SQLite attaché à son identité et
à son territoire, et interroge les événements après ce curseur. Le traitement
est au moins une fois : le curseur n'avance qu'après le traitement de l'événement.
Un crash entre l'effet et l'avancement peut donc entraîner un rejeu ; le cooldown
limite certains réveils répétés, sans fournir une garantie exactly-once. Le champ
`woke` est une télémétrie par événement indiquant qu'un runtime attaché a accepté
le heartbeat. Il ne déduplique pas les événements ultérieurs ou d'autres daemons ;
un bridge sans runtime enregistre `woke=false`.

L'EventEmitter local peut rester une optimisation dans son processus. Il n'est
pas un transport interprocessus ni une preuve de livraison. Cette décision vise
le déploiement documenté où backend et daemon partagent le même fichier SQLite;
elle ne constitue pas une solution de cluster multi-hôte.

## Conséquences

- Le host reprend les événements arrivés après son dernier curseur après un
  redémarrage.
- À la toute première initialisation, le curseur est placé sur le dernier événement
  déjà journalisé pour le territoire ; le host ne rejoue donc pas l'historique antérieur
  à son premier démarrage.
- Une panne pendant le traitement peut rejouer un événement ; le curseur est propre au
  daemon et au territoire, et les politiques de cooldown/budget bornent les wakes sans
  constituer une déduplication durable.
- Le rapport de santé doit distinguer la présence d'un heartbeat de l'activité
  réellement traitée; ce changement ne confère aucun pouvoir d'écriture au daemon.

## Alternatives

- Garder le bus mémoire seul : rejeté, car aucun événement ne traverse la
  frontière de processus.
- Ajouter un broker réseau : rejeté pour le déploiement mono-hôte actuel; il
  ajouterait un composant sans besoin opérationnel démontré.
