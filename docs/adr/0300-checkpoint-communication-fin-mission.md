# ADR 0300 — Checkpoint de communication à la fin d'une mission

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Orchestration, communication, preuve
- **Décideurs** : GenOS
- **Lié à** : [ADR 003x](003x-communication-ecology.md), [ADR 0294](0294-contrat-residuel-cognitif-signal-plane.md)

## Contexte

Le service de politique de communication sait évaluer `MISSION_COMPLETED`, mais
aucun chemin de production ne l'appelait. Le verdict de fin de mission est déjà
soumis au gate de continuité ; un événement de transport ne doit pas pouvoir
transformer un échec de communication en succès de mission, ni l'inverse.

## Décision

Après la transition de mission autorisée par le gate, l'orchestrateur appelle
`evaluateCheckpoint` pour `MISSION_COMPLETED`. Une fin bloquée n'active pas ce
checkpoint. La politique conserve le choix `SILENCE` et peut utiliser les canaux
déjà exécutables (`SIGNAL` ou `STIGMERGY`). L'orchestrateur émet une télémétrie
qui distingue l'évaluation, l'action et l'échec. Une panne de politique ou de
télémétrie ne modifie pas le verdict du gate ; le résultat local porte l'échec.
La référence sémantique `mission:<id>:completed` ne naît que d'un gate autorisé ;
elle identifie le fait de complétion sans le promouvoir comme preuve autonome.

Ce raccord n'autorise ni promotion de preuve ni conclusion métier à partir de
la seule livraison d'un signal.

## Conséquences

- Le checkpoint de fin de mission possède un appelant réel.
- Les autres checkpoints restent à raccorder à leurs événements source.
- La télémétrie est une trace best effort, pas un reçu durable garanti.
- Les canaux non exécutables de la politique restent explicitement non exécutés.
