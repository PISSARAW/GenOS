# ADR 0235 — Ontogenèse : orchestrateur résident de projet à missions bornées et vérifiées

- **Statut** : Accepté (première tranche : contrat et persistance)
- **Date** : 2026-10-01
- **Domaine** : Orchestration, persistance, preuve, ressources, Git
- **Décision-id** : 0235

## Contexte

GenOS possède déjà les briques nécessaires à une exécution longue et bornée :
daemon résident d'observation (ADR 0034, `daemon/residentDaemonRuntime.js`),
registres de morphogenèse et de variantes (`morphogenesis/*`, `agents/*`),
contrats de workers (ADR 0063b, 0064a, `agents/workerKindService.js`),
file de continuations persistantes (`durableContinuationService.js`,
table `continuation_queue`), réconciliation des processus
(`agentRuntimeAdapter/missionReconcile.js`) et preuves avant promotion
(ADR 0198, 0206, 0234).

Ces briques ne sont pas reliées en une boucle durable : il manque un
propriétaire explicite de projet, un état transactionnel de bout en bout,
une machine à états opposable, une régulation mémoire réelle sous Windows
et un intégrateur Git unique. Sans cela, une reprise après crash peut
dupliquer un worker ou une intégration, élargir silencieusement les
autorisations, ou présenter un transport réussi comme une décision valide.

L'Ontogenèse vise un orchestrateur résident de projet, de durée de vie
indéfinie, qui enchaîne des missions bornées et vérifiées. Chaque tâche
conserve ses limites de ressources et ses gates de preuves.

## Décision

### 1. Deux rôles séparés

- Le daemon résident actuel reste un observateur : sensing, cartographie,
  findings, handoff. Il ne dispatche pas, n'édite pas, ne committe pas.
- Un contrôleur d'Ontogenèse distinct possède l'autorité explicite de
  dispatch, d'édition et de commit sur un projet donné, un cahier des
  charges versionné et une branche d'intégration dédiée
  (`codex/ontogenesis` par défaut). Cette séparation est vérifiable :
  les chemins de dispatch et de commit passent par le contrôleur,
  jamais par le runtime d'observation.

### 2. Contrats existants réutilisés, jamais contournés

Le contrôleur utilise les mécanismes GenOS par leurs contrats existants :
morphogenèse et topologies par `morphogenesis/*` et adaptateurs
(`trinityBranchAdapter.js`, `rhizomeBranchAdapter.js`),
workers par `workerKindService.js` et `workerContractEnforcement.js`,
snapshots et forks par les stores contrefactuels, budgets par les
services métaboliques, preuves et promotion par les gates (ADR 0198,
0206, 0135, 0234), mémoire d'échecs avant choix d'approche.

Créer une nouvelle mission n'élargit jamais les autorisations et ne
réinitialise jamais les budgets : les plafonds sont hérités du projet
et décroissants. Toute élévation exige une décision explicite, tracée
et prouvable.

### 3. Objets persistés

Tables dédiées `ontogenesis_*` (migration `migrateOntogenesis.js`) :

| Objet | Contenu |
| --- | --- |
| Projet | dossier autorisé, branche, objectif, configuration versionnée |
| Backlog | tâches, dépendances, priorité, critères d'acceptation |
| Exécution | mission, workers, topologie, budgets, tentative |
| Décision | alternatives, justification, preuves exécutables |
| Intégration | HEAD de départ, changements, validations, SHA du commit |
| Contrôle | pause, arrêt, sommeil, raison et conditions de reprise |

`continuation_queue` reste une brique de transport, pas une garantie de
reprise complète : au redémarrage, la base est réconciliée avec les
processus réels, les worktrees et les commits avant tout nouveau dispatch.

### 4. Exclusion mutuelle et reprise

Un claim transactionnel (`ontogenesis_claims`, expiration, identifiant
d'opération idempotent) empêche deux instances de traiter le même
projet. Au redémarrage : expiration des claims morts, réconciliation
processus / worktrees / commits, reprise depuis l'unité de travail
persistée. Un crash pendant le dispatch ne crée pas deux workers ;
un crash entre création du commit et mise à jour SQLite ne crée pas
deux intégrations (le SHA existant est détecté et réconcilié).

### 5. Machine à états

États : `INITIALIZING`, `PLANNING`, `EXECUTING`, `VERIFYING`,
`INTEGRATING`, `SLEEPING_RESOURCE`, `WAITING_INPUT`, `IDLE`, `PAUSED`,
`STOPPING`, `STOPPED`.

Boucle : observer → planifier → sélectionner → exécuter → vérifier →
intégrer → réévaluer. Une tâche terminée sans preuves suffisantes reste
`non vérifiée`, jamais promue. Les tentatives répétées sans progrès sont
bornées ; dépendance manquante, décision indispensable ou budget épuisé
conduit à un état d'attente explicite avec raison.

Persistance de l'intention : une pause manuelle (`PAUSED`) survit au
redémarrage ; seul un sommeil lié aux ressources (`SLEEPING_RESOURCE`)
autorise un réveil automatique quand la disponibilité redevient
suffisante et stable (hystérésis).

### 6. Mémoire réelle et intégration Git

Le Biome seul ne mesure pas la pression mémoire Windows. Un service de
mesure et un contrôleur d'admission communs à tous les dispatchs
observent : mémoire physique disponible, pression système, arbres de
processus du superviseur, coût des modèles locaux, réservations déjà
admises. Seuils Normal / Contraint / Critique / Reprise avec hystérésis.
Sous Windows, étudier les Job Objects pour borner les processus détenus ;
une limite de heap Node ne couvre ni les enfants ni la mémoire native.

Un seul intégrateur écrit dans la branche : recevoir le candidat avec
preuves → vérifier la compatibilité avec le HEAD courant → intégrer
dans un espace de validation → exécuter les contrôles requis → créer
un commit conforme aux conventions → enregistrer son SHA et clôturer.
Les preuves portent sur le résultat intégré. Conflit → tâche de
résolution bornée. Modifications humaines préservées ; secrets, bases
et artefacts exclus. Push et fusion restent des capacités configurées
séparément.

### 7. Responsabilité durable et conversation permanente

L'Ontogenèse porte une responsabilité durable : un objectif versionné,
des critères de réussite et des limites d'autorité attachés au projet
(`ontogenesis_projects` + `config_json` versionné). Le contrôleur
travaille entre les messages et accepte de nouvelles priorités sans
relancer le projet :

- **Conversation pendant l'exécution** : une boîte de réception
  persistante (`ontogenesis_inbox`, `ontogenesis_events`) reçoit les
  messages et les événements (Git, fin de worker, retour des
  ressources, échéances, réponse utilisateur). Un message actualise
  les priorités du backlog, jamais tout l'état.
- **Mémoire continue** : préférences, décisions, contraintes, échecs
  et questions ouvertes avec provenance (`ontogenesis_memory`).
  Les mémoires d'échecs sont consultées avant chaque choix d'approche.
- **Initiative** : le contrôleur choisit la prochaine action autorisée
  depuis le backlog et les événements, puis dort en attendant
  l'événement suivant. Léger par construction : il n'appelle un
  modèle que lorsqu'une décision l'exige.
- **Réveils autonomes** : Git, fin de worker, retour des ressources,
  échéance, réponse utilisateur. `WAITING_INPUT` et `IDLE` sont
  réveillés par un événement explicite ; `SLEEPING_RESOURCE` par une
  disponibilité suffisante et stable ; `PAUSED` jamais automatiquement.
- **Délégation suivie** : missions GenOS lancées, preuves examinées,
  instructions complémentaires envoyées. Aucune promotion sans preuves
  exécutables portant sur le résultat intégré.
- **Retour vers l'opérateur** : notification sur résultat significatif,
  blocage ou décision nécessaire (`ontogenesis_notifications`) ;
  silence pendant les périodes sans changement.
- **Vue d'activité** : tâches, workers, preuves, changements et commits
  exposés ; réorientation ou arrêt toujours possibles.

Architecture : conversation et événements → contrôleur d'Ontogenèse →
missions GenOS → preuves et intégration Git → mémoire et notifications.
La morphogenèse, les topologies et les workers sont le moteur
d'exécution ; le contrôleur ne les contourne jamais.

### 8. Autorisation et vérification sont distinctes

L'opérateur peut autoriser à l'avance, dans la branche dédiée
uniquement : éditions, tests et commits (`authority` dans la
configuration versionnée : branches, chemins, budgets, push/fusion
séparés). Les gates vérifient ensuite les résultats, toujours.
Toute action hors périmètre autorisé crée une demande d'approbation
précise (`ontogenesis_approval_requests`, état `pending`) au lieu
d'être exécutée. Autoriser n'est pas prouver.

### 9. Hébergement et continuité hors-ligne

Une Ontogenèse exclusivement locale s'arrête avec sa machine : aucun
travail, aucun réveil, aucune notification pendant l'extinction.
La continuité lorsque le PC est éteint exige un contrôleur et des
workers hébergés sur une machine toujours disponible, avec la même
base réconciliée et les mêmes claims. Première version (V1) : un
projet, une conversation, une branche, une responsabilité durable,
en local. Exécution distante et canaux supplémentaires ensuite,
sans changer le contrat d'autorité ni les gates.

## Conséquences

- Nouveau périmètre `backend/src/services/ontogenesis/` modulaire
  (un fichier par responsabilité, ≤ 400 lignes, ≤ 3 paramètres,
  complexité ≤ 10) et migration SQLite associée.
- Le daemon d'observation ne gagne aucun pouvoir d'écriture ; tout
  élargissement passe par le contrôleur et ses gates.
- La première version utilisable doit déjà : reprendre après crash sans
  double worker ni double commit, respecter l'enveloppe mémoire, produire
  des commits vérifiés. Les huit topologies (Trinity, A-Team, Biocénose,
  Holobionte, Syncytium, Biome, Rhizome, Métapopulation) sont branchées
  ensuite sur cette base, en commençant par une topologie.
- Exploitation : commandes `g ontogenesis init|start|status|pause|resume|stop`,
  transport interprocessus dédié (le bus local du daemon ne suffit pas),
  autostart Windows avec reprise de l'intention, rétention bornée des
  logs, traces et worktrees.
- Scénarios de validation obligatoires : petit projet de bout en bout,
  échec worker avec repli borné, saturation mémoire avec sommeil et
  réveil, redémarrage à chaque étape critique, double lancement,
  arrêt pendant travail ou intégration, résultat sans preuves refusé,
  exécution prolongée sans croissance incontrôlée.

## Alternatives

- Étendre le daemon résident existant avec des pouvoirs d'écriture :
  rejeté, car cela confond observation et autorité et rend l'audit
  impossible.
- Faire confiance à `continuation_queue` pour la reprise complète :
  rejeté, car c'est un transport sans réconciliation avec le réel
  (processus, worktrees, commits).
- Réguler uniquement les ressources abstraites du Biome : rejeté sous
  Windows, car sans mesure système la pression mémoire n'est pas vue.
- Laisser chaque worker commiter directement : rejeté, car cela autorise
  les doubles intégrations et les conflits silencieux.

## Tests

- `backend/tests/test_ontogenesis_state_machine.js` : transitions
  légales, pause persistante contre réveil ressource, refus de
  promotion sans preuves.
- `backend/tests/test_ontogenesis_claims.js` : exclusion mutuelle,
  expiration, idempotence d'opération, reprise sans double dispatch.
- `backend/tests/test_ontogenesis_integration.js` : crash simulé entre
  commit et SQLite, réconciliation par SHA, conflit et préservation
  humaine (à venir avec l'intégrateur).
- Portes du dépôt : `python scripts/ci/check_code_quality.py`,
  `npm test`, `cargo test --workspace`.

## Références

- ADR 0034 (daemons résidents), 0063b et 0064a (workers), 0133 (graphe
  morphologique exécutable), 0198 (vérification épistémique), 0206
  (decision-evidence binding), 0234 (preuves POET).
- `docs/02-orchestration/topologies-et-capacites.md`,
  `docs/03-reference/types-de-workers.md`,
  `docs/03-reference/outils-mcp.md`,
  `docs/04-exploitation/resilience-et-reprise.md`.
- Documentation Dots (comportements, pas architecture interne) :
  `https://learn.chatgpt.com/docs/dots`,
  `https://learn.chatgpt.com/docs/dots/controls`.
