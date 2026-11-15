# ADR 0713 — Observation Git résidente et handoff de mission

- **Statut** : accepté
- **Date** : 2026-11-15
- **Portée** : host `ResidentDaemon`, cartographie territoriale, pont de production et missions
- **Lié à** : ADR 0034, ADR 0290, ADR 0712

## Contexte

Les hosts résidents maintenaient un heartbeat et consommaient `daemon_events`,
mais aucun capteur durable du dépôt n’alimentait ce journal. Un processus pouvait
donc rester `HEALTHY` et `DORMANT` sans observer un changement réel du worktree.

La cartographie complète était bornée à 2 000 fichiers. Les deux monorepos locaux
dépassaient cette borne : leur index restait `DEGRADED`, sans `indexed_head_sha`,
et le cycle excluait ensuite cet état de ses reprises. Enfin, le pont de mission
reconnaissait `workspacePath`, alors que plusieurs chemins d’exécution transmettent
`workspaceRoot`.

## Décision

Chaque host `ResidentDaemon` exécute un observateur Git déterministe et borné :

- `git rev-parse HEAD` détecte un nouveau commit ;
- `git status --porcelain=v1 -z` détecte les modifications suivies et non suivies ;
- une empreinte SHA-256 déduplique un worktree inchangé, y compris après reprise ;
- les deltas deviennent des événements durables `TERRITORY_COMMIT` ou
  `TERRITORY_FILE_CHANGED` dans la base partagée ;
- au-delà de 200 chemins modifiés, le delta est déclaré tronqué et force une
  réindexation complète au lieu de prétendre disposer d’un index exact.

La cartographie conserve une borne, portée à 25 000 fichiers. Elle reconstruit le
graphe par transactions de 100 fichiers afin de borner la mémoire et le WAL tout
en laissant les heartbeats progresser. Une cartographie tronquée reste `DEGRADED`,
mais le cycle tente désormais sa reprise tant que le HEAD indexé diffère du HEAD
territorial. Le plafond peut être injecté dans les tests afin de vérifier le
comportement tronqué sans créer une fixture massive.

Les triggers de projection du graphe utilisent 128 bits aléatoires pour leur
`event_id`. La variante historique à 32 bits pouvait entrer en collision pendant
une reconstruction complète et interrompre un résident sur une contrainte
`UNIQUE`.

Le pont territorial normalise `workspacePath`, `workspace_path`, `workspaceRoot`
et `workspace_root`. Le brief compilé à l’entrée de la mission reste une preuve
consultative : il est ajouté au prompt avec son avertissement existant et sa
consommation est enregistrée.

L’auto-démarrage Windows lance la flotte résidente enregistrée dans la base
partagée. Le keeper historique reste disponible comme commande de compatibilité,
mais n’est plus confondu avec le démarrage des observateurs.

## Invariants

- L’observateur ne modifie aucun fichier du dépôt.
- Un événement de transport ne promeut aucun finding.
- Les chemins dépassant les limites ou non confinés rendent l’index périmé.
- Le daemon observe et produit des findings ; la mission vérifie avant usage.
- Une absence de territoire conserve la dégradation gracieuse existante.

## Preuves attendues

- un changement réel du worktree produit un événement durable ;
- le résident consomme cet événement, passe par `FOCUSED` et produit un finding ;
- une mission identifiée par `workspaceRoot` reçoit un `TerritoryBrief` contenant
  ce finding ;
- les deux territoires locaux atteignent `ACTIVE` avec un `indexed_head_sha` égal
  à leur HEAD ;
- les suites daemon et le gate de qualité restent verts.
