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
est au moins une fois : le curseur n'avance qu'après le traitement du signal.
Les événements déjà traités en mémoire ne sont pas réveillés une seconde fois.
Le champ `woke` signifie désormais qu'un runtime attaché a effectivement accepté
le heartbeat; un bridge sans runtime enregistre `woke=false`.

L'EventEmitter local peut rester une optimisation dans son processus. Il n'est
pas un transport interprocessus ni une preuve de livraison. Cette décision vise
le déploiement documenté où backend et daemon partagent le même fichier SQLite;
elle ne constitue pas une solution de cluster multi-hôte.

## Conséquences

- Le host reprend les événements arrivés après son dernier curseur après un
  redémarrage.
- Une panne pendant le traitement peut rejouer un événement; les effets de wake
  sont bornés par la politique de cooldown du runtime.
- Le rapport de santé doit distinguer la présence d'un heartbeat de l'activité
  réellement traitée; ce changement ne confère aucun pouvoir d'écriture au daemon.

## Alternatives

- Garder le bus mémoire seul : rejeté, car aucun événement ne traverse la
  frontière de processus.
- Ajouter un broker réseau : rejeté pour le déploiement mono-hôte actuel; il
  ajouterait un composant sans besoin opérationnel démontré.
