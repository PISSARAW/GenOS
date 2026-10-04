# ADR 0297 — Réarmement des workers au démarrage

- Statut : accepté
- Date : 2026-10-04
- Domaine : Signal Plane, workers, reprise

## Contexte

Les livraisons sont inscrites en SQLite, mais les callbacks de réveil
restaient en mémoire. Après un redémarrage, un worker déjà `idle` ne recevait
aucun callback tant qu'il ne traversait pas une nouvelle transition d'état.
Les écritures différées des poids synaptiques pouvaient aussi rester en cours
lors de l'arrêt de la base.

## Décision

Chaque processus backend réarme les workers `idle` depuis la base avant de
démarrer le subscriber. Le balayage durable de la file reprend ensuite les
livraisons en attente, protégées par les baux existants. À l'arrêt, le
subscriber cesse de prendre des travaux et le serveur attend les écritures
de plasticité avant de fermer SQLite. Une erreur de flush est journalisée.

Une livraison n'est comptée comme action utile que si son handler renvoie
explicitement `acted: true`; le seul succès du transport ne suffit pas.

## Conséquences

Chaque processus possède un callback local pour les workers inactifs; la
prise atomique des livraisons décide lequel agit. Le réarmement n'exécute
aucune mission et ne contourne pas les gates du runtime.
