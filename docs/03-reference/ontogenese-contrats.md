# Contrats stables de l'Ontogenèse

- **Statut** : Implémenté
- **Portée** : contrats stables V1
- **Dernière revue** : 2026-10-06

Référence des contrats persistants et comportementaux de l'Ontogenèse (ADR 0235).
Sources : `backend/src/db/migrations/migrateOntogenesis.js` (migration 086),
`backend/src/db/migrations/migrateOntogenesisConversation.js` (migration 088),
`backend/src/services/ontogenesis/configSchema.js`, `stateMachine.js`, `claimService.js`,
`inboxService.js`, `memoryService.js`, `notificationService.js`, `activityView.js`,
`integrationService.js`, `topologySelector.js`, `memoryPressure.js`,
`backend/bin/genos-ontogenesis.cjs`, `canonicalConceptRegistry.js`,
`missionCapabilityPlanService.js`, `runtimeHarness.js`,
`philosophicalMissionContract.js`, `philosophicalObservationService.js`, `integrationController.js`.
Tout écart entre ce document et ces fichiers est un bug de documentation.

Le raccord détaillé des concepts philosophiques est documenté séparément dans
[Contrats philosophiques dans l’Ontogenèse](contrats-philosophiques-ontogenese.md).

## 1. Tables `ontogenesis_*`

Les 12 tables fondatrices ci-dessous viennent des migrations 086 et 088.
Les extensions ajoutent notamment `ontogenesis_execution`, `ontogenesis_pressure`,
`ontogenesis_spend`, les échéances, questions, canaux, hôtes et résumés : consulter
les migrations `migrateOntogenesis*` pour leurs colonnes complètes.
Les créations de tables et d'index sont idempotentes.
Toutes les tables métier portent `project_id TEXT NOT NULL REFERENCES ontogenesis_projects(id) ON DELETE CASCADE`
(sauf `ontogenesis_projects` elle-même et `ontogenesis_claims`, dont la clé primaire est `project_id` sans FK déclarée).

| Table | Rôle | Index |
| --- | --- | --- |
| `ontogenesis_projects` | Projet : racine, branche, objectif, config versionnée, état courant | — (PK `id`) |
| `ontogenesis_backlog` | Tâches du projet avec statut, priorité, dépendances, acceptation, tentatives | `idx_onto_backlog_project (project_id, status, priority)` |
| `ontogenesis_runs` | Exécutions worker : topologie, variante, workers, budgets, tentative, statut | `idx_onto_runs_project (project_id, status)` |
| `ontogenesis_decisions` | Décisions de sélection : alternatives, justification, preuves | — (PK `id`) |
| `ontogenesis_integrations` | Intégrations : `base_sha`, `result_sha`, statut, contrôles | — (PK `id`) |
| `ontogenesis_control` | Mode d'exploitation persistant (pause/arrêt) ; PK `project_id` | — (PK `project_id`) |
| `ontogenesis_claims` | Claim transactionnel : un seul détenteur par projet ; PK `project_id` | — (PK `project_id`) |
| `ontogenesis_inbox` | Boîte de réception opérateur/système | `idx_onto_inbox_project (project_id, status, created_at)` |
| `ontogenesis_events` | Événements de réveil (`consumed` 0/1) | `idx_onto_events_project (project_id, consumed, created_at)` |
| `ontogenesis_memory` | Mémoire avec provenance | `idx_onto_memory_project (project_id, kind, created_at)` |
| `ontogenesis_notifications` | Notifications sobres | `idx_onto_notifications_project (project_id, status, created_at)` |
| `ontogenesis_approval_requests` | Demandes d'approbation | `idx_onto_approvals_project (project_id, status, created_at)` |

Colonnes et contraintes `CHECK` (recopie exacte des migrations) :

| Table | Colonnes | `CHECK` / défauts |
| --- | --- | --- |
| `ontogenesis_projects` | `id`, `root_path`, `branch` (`'codex/ontogenesis'`), `objective` (`''`), `config_json` (`'{}'`), `config_version` (`1`), `state` (`'INITIALIZING'`), `created_at`, `updated_at` | `state IN ('INITIALIZING','PLANNING','EXECUTING','VERIFYING','INTEGRATING','SLEEPING_RESOURCE','WAITING_INPUT','IDLE','PAUSED','STOPPING','STOPPED')` |
| `ontogenesis_backlog` | `id`, `project_id`, `title`, `status` (`'todo'`), `priority` (`0`), `depends_on_json` (`'[]'`), `acceptance_json` (`'[]'`), `attempt` (`0`), `updated_at` | `status IN ('todo','doing','verifying','integrating','done','blocked')` |
| `ontogenesis_runs` | `id`, `project_id`, `task_id` (nullable), `topology`, `variant` (nullable), `worker_json` (`'{}'`), `budgets_json` (`'{}'`), `attempt` (`1`), `status` (`'running'`), `created_at` | `status IN ('running','verified','unverified','failed','integrated')` |
| `ontogenesis_decisions` | `id`, `project_id`, `task_id` (nullable), `alternatives_json` (`'[]'`), `rationale` (`''`), `evidence_json` (`'{}'`), `created_at` | — |
| `ontogenesis_integrations` | `id`, `project_id`, `task_id` (nullable), `base_sha`, `result_sha` (nullable), `status` (`'pending'`), `checks_json` (`'[]'`), `created_at` | `status IN ('pending','committed','conflict','rejected')` |
| `ontogenesis_control` | `project_id` (PK), `mode` (`'running'`), `reason` (`''`), `resume_json` (`'{}'`), `updated_at` | `mode IN ('running','paused','stopping','stopped','sleeping_resource','waiting_input')` |
| `ontogenesis_claims` | `project_id` (PK), `owner`, `operation_id`, `expires_at`, `updated_at` | — |
| `ontogenesis_inbox` | `id`, `project_id`, `kind` (`'user'`), `body` (`''`), `status` (`'pending'`), `created_at` | `kind IN ('user','priority','stop','system')` ; `status IN ('pending','applied','rejected')` |
| `ontogenesis_events` | `id`, `project_id`, `type`, `payload_json` (`'{}'`), `consumed` (`0`), `created_at` | `type IN ('git','worker_done','resource','deadline','user_reply','wake')` |
| `ontogenesis_memory` | `id`, `project_id`, `kind`, `content` (`''`), `provenance_json` (`'{}'`), `created_at` | `kind IN ('preference','decision','constraint','failure','question')` |
| `ontogenesis_notifications` | `id`, `project_id`, `kind`, `payload_json` (`'{}'`), `status` (`'pending'`), `created_at` | `kind IN ('result','blocked','decision_needed')` ; `status IN ('pending','sent','acked')` |
| `ontogenesis_approval_requests` | `id`, `project_id`, `action`, `scope_json` (`'{}'`), `status` (`'pending'`), `created_at` | `status IN ('pending','approved','denied')` |

## 2. Configuration versionnée

`CONFIG_VERSION = 1`, `DEFAULT_BRANCH = 'codex/ontogenesis'` (`configSchema.js`).

| Champ | Défaut (`defaultConfig()`) | Règle (`validateProjectConfig`) / erreur exacte |
| --- | --- | --- |
| `version` | `1` | doit égaler `CONFIG_VERSION`, sinon `version-inconnue` |
| `branch` | `'codex/ontogenesis'` | chaîne non vide requise, sinon `branch-requise` |
| `budgets` | `{ tokens: 140000, usd: 1, seconds: 120 }` | objet requis sinon `budgets-requis` ; `tokens > 0` sinon `budgets.tokens-positif-requis` ; `seconds > 0` sinon `budgets.seconds-positif-requis` (`tokens` et `seconds` finis positifs ; `usd` fini non négatif) |
| `topologies` | `['trinity']` | liste non vide de noms connus ; `topologies-non-vides-requises` ou `topologie-inconnue` |
| `memory` | `{ envelopeMb: 2048, reserveMb: 512 }` | objet requis sinon `memory-requis` ; `envelopeMb > 0` sinon `memory.envelopeMb-positif-requis` ; `reserveMb >= 0` sinon `memory.reserveMb-negatif-interdit` ; `reserveMb < envelopeMb` sinon `memory.reserve-inferieure-enveloppe` |
| `allowPush` | `false` | `true` interdit : `allowPush-interdit-par-defaut` |
| `allowMerge` | `false` | `true` interdit : `allowMerge-interdit-par-defaut` |
| `authority` | `{ allowEdit: true, allowTests: true, allowCommit: true, paths: ['*'], branches: ['codex/ontogenesis'] }` | objet requis sinon `authority-requise` ; `branches` tableau requis sinon `authority.branches-requises` ; `paths` tableau requis sinon `authority.paths-requis` |

`validateProjectConfig(input)` fusionne `Object.assign(defaultConfig(), input || {})` et retourne
`{ ok, errors, config }`. La CLI `init` échoue avec `configuration-invalide:${errors.join(',')}` si `!ok`.

## 3. Machine à états

11 états (`STATES` dans `stateMachine.js`) :

`INITIALIZING`, `PLANNING`, `EXECUTING`, `VERIFYING`, `INTEGRATING`,
`SLEEPING_RESOURCE`, `WAITING_INPUT`, `IDLE`, `PAUSED`, `STOPPING`, `STOPPED`.

Transitions légales (`TRANSITIONS`, recopie exacte) :

| État | Événement → état suivant |
| --- | --- |
| `INITIALIZING` | `planned` → `PLANNING` ; `paused` → `PAUSED` ; `stopped` → `STOPPING` |
| `PLANNING` | `dispatch` → `EXECUTING` ; `wait` → `WAITING_INPUT` ; `idle` → `IDLE` ; `resource` → `SLEEPING_RESOURCE` ; `paused` → `PAUSED` ; `stopped` → `STOPPING` |
| `EXECUTING` | `finished` → `VERIFYING` ; `resource` → `SLEEPING_RESOURCE` ; `paused` → `PAUSED` ; `stopped` → `STOPPING` |
| `VERIFYING` | `passed` → `INTEGRATING` ; `failed` → `PLANNING` ; `resource` → `SLEEPING_RESOURCE` ; `wait` → `WAITING_INPUT` ; `paused` → `PAUSED` ; `stopped` → `STOPPING` |
| `INTEGRATING` | `integrated` → `PLANNING` ; `idle` → `IDLE` ; `resource` → `SLEEPING_RESOURCE` ; `wait` → `WAITING_INPUT` ; `paused` → `PAUSED` ; `stopped` → `STOPPING` |
| `SLEEPING_RESOURCE` | `recovered` → `PLANNING` ; `paused` → `PAUSED` ; `stopped` → `STOPPING` |
| `WAITING_INPUT` | `resumed` → `PLANNING` ; `paused` → `PAUSED` ; `stopped` → `STOPPING` |
| `IDLE` | `awakened` → `PLANNING` ; `paused` → `PAUSED` ; `stopped` → `STOPPING` |
| `PAUSED` | `resumed` → `PLANNING` ; `stopped` → `STOPPING` |
| `STOPPING` | `done` → `STOPPED` |
| `STOPPED` | — (aucune transition) |

`nextState(current, event)` retourne `null` si l'événement est inconnu.
`canTransition(from, to)` teste l'appartenance aux valeurs de la table.
`allowsAutoWake(value)` retourne `true` uniquement pour `SLEEPING_RESOURCE` :
seul cet état autorise un réveil automatique ; la pause manuelle est persistante.

## 4. Claims

`claimService.js` : un seul détenteur par projet (PK `project_id` sur `ontogenesis_claims`).
Entrée : `{ projectId, owner, ttlMs }`, TTL par défaut `60000` ms (`claimTtl`).

| Opération | Sémantique |
| --- | --- |
| Acquisition | Insertion avec un UUID frais ; une contrainte de concurrence conduit à vérifier la ligne existante. |
| Claim actif | Refus `claim-actif`, même pour le même propriétaire ; aucune réentrée implicite. |
| Vol après expiration | Mise à jour conditionnée par `julianday(expires_at) <= julianday('now')` et nouveau UUID. |
| Renouvellement | `extendClaim` conserve l'UUID et exige propriétaire, opération et expiration encore valide ; sinon `claim-perdu`. |
| Libération | Suppression conditionnée par projet, propriétaire et opération. |

Le tick utilise un TTL de 120 secondes et un heartbeat toutes les 10 secondes.
La compilation de mission a lieu avant le claim ; sa configuration est relue
sous claim avant utilisation. Les effets d'exécution et d'intégration conservent
le contrôle de fencing. Un calcul synchrone ne constitue pas une garantie de
renouvellement temps réel du lease.

## 5. Inbox, événements, mémoire, notifications, approbations

| Famille | Enums exacts (code et `CHECK` SQL) |
| --- | --- |
| Inbox `kind` | `user`, `priority`, `stop`, `system` (défaut `user`) |
| Inbox `status` | `pending`, `applied`, `rejected` (défaut `pending`) |
| Événement `type` | `git`, `worker_done`, `resource`, `deadline`, `user_reply`, `wake` |
| Événement `consumed` | `0` (en attente), `1` (consommé) |
| Mémoire `kind` (`MEMORY_KINDS`) | `preference`, `decision`, `constraint`, `failure`, `question` |
| Notification `kind` (`NOTIFICATION_KINDS`) | `result`, `blocked`, `decision_needed` |
| Notification `status` | `pending`, `sent`, `acked` (défaut `pending`) |
| Approbation `status` | `pending`, `approved`, `denied` (défaut `pending`) |

Règles : `postInbox` insère toujours en `pending` (`message.kind || 'user'`) ;
préfixes d'identifiants `inbox_`, `evt_`, `mem_`, `notif_`, `appr_` + `crypto.randomUUID()`
(`recordMemory` sans préfixe constant : `` `mem_${...}` ``).
`recordMemory` et `notify` lèvent respectivement `memory-kind-invalide` et
`notification-kind-invalide` sur kind inconnu.
Listes pendantes triées par `created_at ASC` ; `markInbox` / `markNotified` mettent à jour
le statut (`markNotified` valide les statuts connus) ; `consumeEvent` fixe `consumed = 1`.

Vue d'activité (`activityView.js`, pure) : `summarizeBacklog` compte
`total/todo/doing/blocked/done` ; `summarizeRuns` compte `total/running/verified/unverified/failed` ;
`buildActivity` expose `projectId/state/branch/lastCommit/waitReason/backlog/runs/pendingInbox/pendingNotifications/memory.failures`.

## 6. Sélecteur de topologie

`topologySelector.js`. `FAILURE_LIMIT = 2`.

| Topologie | Besoins (`needs`) | Rôles workers | Classe de coût (`cost`) |
| --- | --- | --- | --- |
| `trinity` | `execute`, `verify` | `specialist`, `bounded_worker`, `verifier_worker` | `2` |
| `a_team` | `execute`, `coordinate` | `sub_orchestrator`, `specialist`, `bounded_worker`, `verifier_worker` | `2` |
| `biocenose` | `execute`, `verify`, `coordinate` | `liaison_worker`, `bounded_worker`, `verifier_worker` | `2` |
| `holobionte` | `execute`, `verify` | `specialist`, `symbiotic_worker`, `verifier_worker` | `3` |
| `syncytium` | `execute`, `analyze` | `specialist`, `bounded_worker`, `verifier_worker` | `3` |
| `biome` | `execute`, `observe` | `adaptive_worker`, `scout_cell` | `1` |
| `rhizome` | `execute`, `observe` | `bounded_worker`, `scout_cell` | `1` |
| `metapopulation` | `execute`, `verify` | `bounded_worker`, `verifier_worker` | `2` |

Ordres de préférence (`PREFERENCES`) par nature de tâche :

| Nature (`taskKind`) | Ordre |
| --- | --- |
| `implement` | `a_team`, `trinity`, `rhizome`, `biome`, `metapopulation`, `syncytium`, `biocenose`, `holobionte` |
| `verify` | `biocenose`, `trinity`, `metapopulation`, `a_team`, `syncytium`, `holobionte`, `rhizome`, `biome` |
| `explore` | `rhizome`, `biome`, `metapopulation`, `trinity`, `a_team`, `biocenose`, `syncytium`, `holobionte` |
| `decide` | `biocenose`, `trinity`, `holobionte`, `metapopulation`, `a_team`, `syncytium`, `rhizome`, `biome` |
| `repair` | `a_team`, `biome`, `metapopulation`, `rhizome`, `trinity`, `syncytium`, `biocenose`, `holobionte` |

Raisons d'élimination exactes (`elimination`) : `capacite-manquante:${besoin}`,
`tache-lourde-reportee` (niveau `constrained` et `cost >= 3`), `memoire-critique` (niveau `critical`),
`echecs-repetes` (échecs ≥ `FAILURE_LIMIT`).
Blocage : `aucune-topologie-autorisee` (liste ordonnée vide), `aucune-topologie-admissible`,
`role-worker-inconnu` (rôle rejeté par `workerKindService`, fail-closed).
Variantes : repli `default` avec note `variante-indisponible:${demandee}` ou `catalogue-indisponible`.
Traces : `${id}:elimine:${motif}`, `${id}:repli:${note}`, `${id}:retenu:cout-${cout}`.

## 7. Pression mémoire

`memoryPressure.js`. `DEFAULT_THRESHOLDS = { constrainedPct: 0.25, criticalPct: 0.12, recoverPct: 0.35 }` (gelé).

| Niveau | Règle (`baseLevel`) |
| --- | --- |
| `critical` | `freePct < 0.12` OU `freeMb - reserveMb - reservationsMb < 0` |
| `constrained` | `freePct < 0.25` |
| `normal` | sinon |

Hystérésis (`stabilizedLevel`) : un niveau `critical` précédent reste `critical` tant que
`freePct < recoverPct` (`0.35`) ; de même `constrained` ne redescend vers `normal` qu'au-dessus de `0.35`.
Admission (`admitWork`) : `critical` → `{ admitted: false, level, reason: 'memoire-critique' }` ;
disponible < estimation → `{ admitted: false, level, reason: 'enveloppe-insuffisante' }` ;
sinon `{ admitted: true, level }`.

## 8. Intégrateur

`integrationService.js`. Un seul écrivain vers la branche d'Ontogenèse :
candidat + preuves → compatibilité `HEAD` → validation → commit → SHA enregistré.

Validation (`validateCandidate`) — erreurs exactes :

| Condition | Erreur |
| --- | --- |
| Branche candidate ni dans `authority.branches` ni `'*'` | `branche-hors-perimetre` |
| `baseSha` absent | `base-sha-requise` |
| `proofs` absent ou vide | `preuves-requises` |
| `files` absent ou vide | `fichiers-requis` |
| Fichier hors `authority.paths` (sauf `'*'`) | `chemin-hors-perimetre:${fichier}` |
| Fichier touchant `FORBIDDEN` | `fichier-interdit:${fichier}` |

Motifs `FORBIDDEN` (recopie exacte) : `/\.env$/i`, `/\.pem$/i`, `/\.key$/i`, `/secret/i`,
`/\.db$/i`, `/\.sqlite/i`, `/(^|\/)node_modules\//`, `/(^|\/)target\//`, `/(^|\/)dist\//`, `/(^|\/)\.git\//`.
Seuls les chemins validés sont stagés explicitement (`git add -- <files>`) ; les fichiers humains
non stagés ne sont jamais touchés.

Message de commit (`buildCommitMessage`) :

```text
[<tag>] <titre>

Genos-Operation: <operationId>
[Genos-Task: <taskId>]
```

(`Genos-Task` uniquement si `taskId` fourni.) Le tatouage `Genos-Operation` permet
la réconciliation après crash entre commit et SQLite : `findCommitByOperation` cherche
`git log --all --grep=Genos-Operation: <operationId>` ; si trouvé, la ligne est adoptée
avec `checks = ['recupere-apres-crash']` et statut `committed`.

Statuts d'intégration : `pending`, `committed`, `conflict`, `rejected`
(`CHECK` de `ontogenesis_integrations`).
`reconcileIntegration` retourne `{ status: 'introuvable' }` si la ligne est absente,
`{ status: 'committed', sha }` si `result_sha` existe dans git ou si le tatouage est retrouvé
(`recovered: true` dans ce second cas), sinon `{ status: <statut-ligne>, sha }`.

### 8.1 Audit philosophique lié à une mission

Pour les concepts explicitement demandés, le plan transporte une référence avec
`contractHash`, `execution`, `observationFile` et `requiredForMission: true`.
Les références de contexte ajoutées automatiquement portent `false` : elles ne
créent pas une obligation imprévue pour une mission sans demande philosophique.

Le runner produit `.genos/philosophy-observations.json` dans sa capsule :

```json
{
  "missionId": "<ontogenesis_execution.id>",
  "contractHashes": { "<concept-id>": "<SHA-256 du contrat canonique>" },
  "bindings": { "<execution.field>": { "file": "evidence.json", "pointer": "/criterion" } }
}
```

La source doit être un fichier JSON régulier confiné, sans segment symbolique ;
les secrets, bases de données, `.git`, `node_modules`, `target` et `dist` sont
refusés. Plafonds : 128 Kio par fichier, 32 sources, 375 contrats, pointeur de
512 caractères et 16 segments. Une source absente, un profil changé, un contrat
dupliqué, une autre mission ou un critère non satisfait bloquent la vérification.

Le contrôleur conserve `result.philosophyAudit` : reçu borné avec `missionId`,
`treeHash`, empreintes du manifeste, des sources, contrats et états d'audit.
Avant intégration, il relit le candidat et exige la même empreinte de reçu.
Après copie, il relit les sources intégrées en utilisant le manifeste conservé
dans la capsule. Le manifeste `.genos/` n'est pas copié ni committé. Le contrôle
est répété après fencing, après commit et lors d'une récupération. Une capsule
indisponible empêche donc la récupération d'une mission ayant un audit requis.

Ce reçu affirme `sourceFactsVerified: false`, `independentValidation: false` et
`promotionEligible: false`. Il prouve les octets évalués et le prédicat borné,
pas la vérité des déclarations, l'utilité d'une théorie ou son adoption par les
autres composants. Le service de maturité n'accepte pas encore ce reçu comme
attestation `integrated`. Voir la
[référence détaillée](contrats-philosophiques-ontogenese.md) et
[ADR 0326](../adr/0326-audits-philosophiques-executables-et-preuves.md).

## 9. CLI opérateur

`backend/bin/genos-ontogenesis.cjs`.
Usage : `node backend/bin/genos-ontogenesis.cjs <commande> [options]`.
Le [runbook opérateur](../04-exploitation/ontogenese.md) détaille les flags de
`run`, `tick`, `task`, `tasks`, `message`, `priority`, `budgets`, `event`,
`notifications`, `ack`, `schedule`, `stop-task` et `prune --artifacts`.
`start` inscrit une intention persistante ; `run` lance le résident.
Transport inter-processus via SQLite WAL (`ontogenesis_inbox`, `ontogenesis_events`,
`ontogenesis_control`), jamais via le bus local du daemon.

| Commande | Flags | Sortie |
| --- | --- | --- |
| `init` | `--root DIR` (requis), `--branch B`, `--objective TXT`, `--project ID` | `projet-cree:${id}` |
| `start` | `--project ID` (requis), `--reason TXT` (accepté, inutilisé pour l'affichage) | vue statut (texte ou JSON) |
| `status` | `--project ID` (requis), `--json` | vue statut (texte ou JSON) |
| `pause` | `--project ID` (requis), `--reason TXT` | vue statut (texte ou JSON) |
| `resume` | `--project ID` (requis) | vue statut (texte ou JSON) |
| `stop` | `--project ID` (requis), `--reason TXT` | vue statut (texte ou JSON) |
| `autostart` | `--on` (+ `--project ID` optionnel) active, sinon désactive | `autostart-active:${batFile}` ou `autostart-desactive:${batFile}` |
| `prune` | `--project ID` (requis), `--days N` (défaut `30`) | `purge:evenements=${events} notifications=${notifications}` |

Vue texte (`printStatus`) : lignes `projet`, `objectif`, `etat` (`${state} (controle: ${control})`),
`branche`, `commit`, `tache` (`topologie= workers=`), `backlog` (`total= todo= doing= bloque= fait=`),
`runs` (`total= en-cours= verifies= non-verifies= echecs=`), `budgets` (JSON),
`memoire` (`libre=${freeMb}Mo/${totalMb}Mo superviseur=${supervisorMb}Mo`),
`attente` (`${waitReason} | inbox= notifs= echecs-memoire=`).
Erreurs exactes (préfixées `erreur:` sur stderr, sortie `1`) : `--root requis`,
`--project requis`, `commande-inconnue:${nom}`, `configuration-invalide:${erreurs}`.

## 10. Garanties et non-garanties

Garanties du contrat :

- Un seul détenteur de claim par projet ; un claim expiré peut être volé, jamais un claim actif
  (pas de double dispatch/worker concurrent via le même projet).
- Un seul écrivain d'intégration ; la réconciliation par `Genos-Operation` empêche la double
  intégration après un crash entre commit git et écriture SQLite.
- Pas de promotion sans preuves : `preuves-requises` bloque tout candidat sans `proofs`.
- Périmètre imposé : branche et chemins validés contre `authority` ; motifs `FORBIDDEN`
  et `allowPush`/`allowMerge` interdits par défaut.
- Pause manuelle persistante (`ontogenesis_control.mode = 'paused'`) ; seul `SLEEPING_RESOURCE`
  autorise un réveil automatique (`allowsAutoWake`).

Non-garanties (hors contrat) :

- La mesure mémoire couvre la RAM physique libre et le RSS du superviseur ; une limite de heap
  Node ne couvre ni les enfants ni la mémoire native, et le bornage des processus détenus
  sous Windows (Job Objects) reste à étudier.
- Les budgets sont des enveloppes et leur clôture est conservatrice ; ils ne constituent
  pas une mesure indépendante des coûts facturés par un fournisseur.
- `markInbox` reste une primitive interne ; les `CHECK` SQL bornent les valeurs.
  `markNotified` refuse les statuts inconnus côté service.
- `resolveVariant` replie silencieusement vers `default` (avec note de rationale) si la
  variante est indisponible ou si le catalogue est inaccessible.

## 11. Pilotage et reprise (ADR 0334)

Les messages en attente sont sélectionnés par lots de 100, puis appliqués chacun dans une transaction,
avec provenance : priorité dans le même projet ou préférence opérateur. Une
entrée invalide est rejetée ; une erreur SQLite annule le message courant et le conserve en attente. Le contexte
worker reçoit les 20 dernières entrées de mémoire, bornées en taille.

Les révisions de budget exigent une raison, aucune exécution active et aucun
claim actif ; elles conservent les dépenses cumulées. Le réveil d'une attente
opérateur emploie `user_reply`. Les événements déjà observés sont acquittés
pour éviter qu'une ancienne réponse réveille une attente ultérieure.

Une exécution persistée est rapprochée de l'état projet après redémarrage.
La pause conserve les candidats terminés ou vérifiés ; l'arrêt d'une tâche
annule son exécution avant promotion. Les erreurs worker explicitement
réessayables sont bornées à trois tentatives ; une vérification refusée exige
une intervention. La clôture d'échec, le compteur, la mémoire et les dépenses
partagent une transaction SQLite.

La rétention d'artefacts ne sélectionne que les exécutions terminales anciennes.
Une capsule est supprimée uniquement dans l'espace géré, sans lien symbolique,
avec empreinte vérifiée persistée inchangée. Les capsules modifiées ou sans
preuve sont conservées ; les reçus, SHA et dépenses restent en base.

Voir [ADR 0334](../adr/0334-ontogenese-pilotage-reprise-et-retention.md).
