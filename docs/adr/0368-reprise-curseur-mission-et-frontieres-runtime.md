# ADR 0368 — Reprise du curseur de mission et frontières runtime

Statut : accepté
Date : 2026-10-10
Domaine : snapshots, missions Rust, contexte LLM
Décideurs : équipe GenOS
Lié à : [ADR 0367](0367-sections-durables-snapshot-organisme.md)

## Contexte

Le snapshot d'agent référençait un checkpoint Rust sans le sélectionner lors
du checkout. Les tours visibles du routeur LLM étaient enregistrés mais pas
réappliqués. Une mission Rust peut être partagée par plusieurs agents.

## Décision

- Conserver les checkpoints immuables et sélectionner celui à reprendre avec
  `orchestration.head.json`. Le store Rust vérifie le fichier, sa séquence et
  son SHA-256, ainsi que toute l'histoire des checkpoints, avant chargement.
- Prendre un verrou de mission commun au tick Rust, à la capture et à la
  restauration. Un verrou abandonné exige une intervention opérateur après
  vérification de l'absence de processus actif.
- Pour une mission partagée, capturer l'empreinte des autres agents, de leurs
  sections durables et des fichiers admissibles de leurs workspaces. Refuser
  le retour arrière si un autre agent est actif ou si l'empreinte ou la
  composition du groupe a changé. Les anciens snapshots sans cette preuve
  restent non restaurables pour une mission partagée.
- Réappliquer les tours LLM visibles dans la transaction SQLite, après un
  snapshot de sécurité. Refuser une restauration pendant un appel en cours.
- Conserver les reçus Rust et SQLite append-only. Après retour arrière, le
  curseur de tick du checkpoint prévaut sur les reçus historiques ; leurs
  identifiants distincts permettent de garder les deux trajectoires. Le
  pointeur conserve cette information lors des checkpoints suivants.
- Exposer explicitement `processMemoryRestored` et
  `providerHiddenContextRestored` à `false`. Aucun runtime ou fournisseur
  présent ne fournit de contrat d'export/import de ces états.

## Limites

La capture de fichiers, la sélection du curseur et la transaction SQLite
restent des phases distinctes : une panne entre elles nécessite une
réconciliation. Le verrou empêche la concurrence avec les ticks Rust
coopératifs ; il ne remplace pas un verrou d'OS pour des écrivains externes.
Les effets externes des ticks et des appels LLM passés ne sont pas annulés.
Cette API ne promet pas une restauration globale de l'organisme.
