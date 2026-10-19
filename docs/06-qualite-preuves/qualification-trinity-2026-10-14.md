# Échecs de missions Trinity réelles — analyse du 2026-10-14

- **Date** : 2026-10-14
- **Statut** : Échec — 0 mission aboutie sur 5 tentatives, causes identifiées et vérifiées
- **Portée** : lancements `dispatch_trinity` via `backend/bin/genos-orchestrate.cjs`
  (variante `controlled`/`composed`, preset `adversarial`), modèle local,
  code au commit `d1895913`
- **Limites** : constats du 2026-10-14 uniquement ; ne requalifie ni la campagne R3
  ni la campagne du 2026-10-06 ; ne mesure aucun avantage causal

## Protocole

Cinq lancements : une mission `fibonacci` (budget 6000 tokens) puis quatre fois
la même mission de diagnostic de latence (120 ms nominal, 1,8 s à froid, CPU < 20 %,
SQL 15 ms ; consigne explicite de falsification : hypothèses concurrentes et
critères de réfutation). Trois lancements depuis le checkout `C:`, deux depuis
le worktree `D:/GenOS-trinity-work` (même HEAD, `GENOS_DB_PATH` sur D,
`npm ci` root + backend + mcp OK). Chaque échec a été diagnostiqué par lecture
directe de la base SQLite (`trinity_worlds`, `trinity_experiments`,
`strategy_execution_runs`, `telemetry_events`, `mission_model_budget_scopes`).

## E1 — Disque C plein : mort au backup pré-migration

Symptôme : `[DB] Pre-migration backup failed (continuing boot): ENOSPC`,
mission 1 terminée sans dispatch. Cause : `C:` à 0 octet libre ;
`genos.db` (2,0 Go) + 3 backups et `backend/genos.db` (1,9 Go) + WAL 0,6 Go
+ 3 backups, soit ~16 Go. Action approuvée : 2 vieux backups racine supprimés,
1 conservé (`genos.db.backup-20260928-061615`) ; 11,2 Go libérés. Les backups
`backend/` restants ont été nettoyés par un processus parallèle. Artefacts
`.worker-*`, `staged*.txt` laissés hors commit conformément à `AGENTS.md`.

## E2 — Quoting PowerShell et `--payload-file`

Symptôme : `Invalid JSON payload argument` (position 1, puis `ENOENT`).
Causes distinctes : (a) le JSON inline entre quotes simples arrive littéralement
dans `process.argv[2]` et `JSON.parse` échoue ; (b) `detachedSpawn.cjs:loadArgv`
n'accepte un fichier que via `--payload-file` **et le supprime après lecture**,
d'où deux `ENOENT` en chaîne quand un run échoué avait déjà consumé le fichier.
Leçon : régénérer le payload à chaque tentative.

## E3 — Disque D et worktree

`D:` porte déjà l'écosystème GenOS (clones, `genos-npm-cache`, `genos-cargo-home`,
`ollama`, `D:/GenOS/.genos-agent-worlds`, qualification Trinity du 2026-10-06),
avec ~99 Go libres. `backend/src/services/agentWorkspaceLifecycle/placement.js:25`
place déjà les mondes sur le disque le plus libre (`D:\GenOS\.genos-agent-worlds`).
Worktree `D:/GenOS-trinity-work` créé au même HEAD, `.env` copié avec
`GENOS_DB_PATH` sur D (plus aucun chemin `C:`), dépendances installées
(`SETUP_DONE:0`). DB fraîche sur D : premier boot exige `GENOS_ADMIN_PASSWORD`
(`backend/src/db/seed.js:181`) — fourni (`trinity-local-run`), seed OK.

## E4 — Gate `snapshot` : chemin de 278 caractères > MAX_PATH Windows (260)

Mission C n°2 : dispatch accepté, preset `adversarial`, diversité modèle
0,135 < seuil 0,35 (monoculture locale, avertissement honnête du gate), puis
les 3 mondes `blocked` : `Phase 'snapshot' gate failed: ENOENT ... mkdtemp
'...\.genos\workspace-snapshots\.snapshot-5cb20733e893-XXXXXX'`.
Mesure : racine snapshot 248 caractères ( `mkdir -p` passe), gabarit de staging
278 caractères (échec). Les IDs embarquent deux UUID complets
(`trinity_<mission>`, `worker_<orchestrateur>_<n>_<12hex>_run_<ts>`).
Références : `backend/src/services/workspaceSnapshotPayload.js:51`
(`fsp.mkdtemp`), `backend/src/services/trinityCapsulePaths.js:54-59`
(`ensureDirectory`, récursif mais impuissant au-delà de 260).
Contournement appliqué : `GENOS_SNAPSHOT_ROOT=D:\gsnap` (racine courte,
`workspaceSnapshotPaths.js:16-21`), chemin résultant ~205 caractères.
Vrai correctif restant : IDs courts ou chemins longs Windows.

## E5 — Sceau : `Trinity source changed while sealing`

Mission C n°3 (avec `D:\gsnap`) : échec au dispatch,
`trinitySealedSnapshot.js:19`. Le sceau hash + copie **tout le `repoRoot`**
(`trinityDispatchPreparation.js:15,26`) puis exige triple égalité des empreintes.
Sur le checkout `C:`, vivant (agents parallèles, fichiers `.tmp`, WAL SQLite),
la copie gigaoctet est intrinsèquement exposée au mismatch. Le worktree D,
calme et sans écrivains concurrents, scelle sans erreur (missions D n°4-5 :
sceau OK). Fragilité structurelle à traiter (source figée ou verrou de scellé),
pas un simple accident.

## E6 — Scope budgétaire parent jamais lié : blocage systémique

Missions D n°4 (sans `costUsd`) puis n°5 (avec `costUsd:1`) : mondes `blocked`
au premier appel modèle, `tokens:0`, `guardrail_reason` :
`A dispatched worker requires its parent model budget scope.`
Table `mission_model_budget_scopes` vérifiée vide dans les deux cas.
Chaîne causale complète :
- `dispatch_trinity` crée le parent par `INSERT` brut
  (`backend/src/services/topology/parentEnsurer.cjs:26`) et ne traverse jamais
  `bindParent` (réservé à `agentRuntimeAdapter/missionPlanning.js:326`,
  via `createMissionExecutionRun`) ;
- `workerLaunchPayload` (`backend/bin/workerLaunchPayload.cjs:70-103`)
  ne transmet aucun `modelBudgetScope` aux workers ;
- au premier appel modèle, `workerEvidenceBarrierLocal.js:61-62` appelle
  `routeBudget` dès qu'un `orchestratorAgentId` existe, et
  `missionModelBudgetScope.js:9,55-64` refuse sans scope.
`costUsd` dans le payload ne change rien : le scope parent n'est tout simplement
jamais créé sur ce chemin. **Conclusion : aucune mission Trinity ne peut
aboutir via `genos-orchestrate` dans l'état actuel du code.**

## E7 — Suite Trinity 40/41 (rappel)

`npm run test:trinity` (41 fichiers) du 2026-10-14 : seul
`test_trinity_merge_direct.js` échoue (`db.get is not a function`) — son faux
`db` ne fournit que `all` alors que `trinityComparativeBarrier.js:34` exige
désormais `db.get` (recherche du run) et filtre sur `executionRunId` (ligne 43).
Test à réaligner ; sans rapport avec E1-E6.

## Correctif proposé (non implémenté au moment de la rédaction — implémenté et vérifié ensuite, voir la section suivante)

Dans `topologyTrinityHandler` : créer un run d'exécution parent puis lier un
scope (`execution-run:<runId>`, plafonds `costUsd`+`tokens` du payload,
persisté et vérifié comme `bindParent`), et propager ce scope dans
`workerLaunchPayload` pour que les workers le portent dans leur mission.
Cela étend le contrôle budgétaire au lieu de le contourner. Non implémenté :
zone d'autorité budgétaire sensible, approbation requise, avec test dédié
(parent lié → workers consomment des tokens ; sans scope → blocage conservé).
Deuxième correctif indépendant : IDs de mondes courts ou support des chemins
longs pour E4.

## Vérification du correctif budgétaire (2026-10-14, commit 73df452c, ADR 0364)

Le correctif (run parent + `bindParent` + propagation `modelBudgetScope`
jusqu'aux workers, refus `TRINITY_BUDGET_REQUIRED` sans plafonds) a été vérifié
de façon indépendante : ADR lue, diff inspecté (chaîne complète sans
contournement d'`assertPersisted`), 4 tests ciblés rejoués et PASS
(`budget_scope`, `dispatch_contract`, `launch_payload`, `dispatch_preparation`),
gate qualité 0 nouvelle violation.

Preuve fonctionnelle (mission diagnostic relancée sur worktree D au commit du
fix, `costUsd:1`, snapshots vers racine courte) : les workers franchissent le
gate budgétaire et appellent le modèle local — monde 1 `running` sans garde,
monde 3 avec 337 s de latence modèle consommées (plafond 300 s atteint), monde 2
avec synthèse cognitive locale produite (`generation failed after retries`).
Table `mission_model_budget_scopes` : scope persisté et réservations actives,
contre table vide avant le fix.

La mission reste `ESCALATE_EXPERIMENT` sur timeout : budgets trop justes pour
un modèle local lent (300 s/monde, 10 min mission) et fragilité du modèle
local — causes de dimensionnement, pas le scope. « Déblocage budgétaire » :
confirmé terminé. « Mission aboutie de bout en bout » : reste à prouver avec
des budgets réalistes.

Notes de campagne : le run diag6 est mort au sceau à cause d'écritures de
scripts de debug dans l'arbre D pendant la copie (même race qu'E5,
auto-infligée) ; le contournement `GENOS_SNAPSHOT_ROOT` court reste requis
tant qu'E4 n'est pas corrigé en code.

## Ce que cela prouve (et ne prouve pas)

Prouvé : les chemins de dispatch, scellé, gates `snapshot`/`budget` et la
barrière fail-closed fonctionnent comme spécifié (3 escalades propres,
0 fausse promotion). Non prouvé : le moindre aboutissement de mission réelle
par ce chemin, la qualité des modèles, ou tout avantage de Trinity.
