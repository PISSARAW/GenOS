# Plan de démonstration incrémentale — GenOS V3

**Objectif :** montrer, étape par étape et avec des preuves à chaque palier, que GenOS fonctionne.  
**Posture :** état alpha. Chaque étape se termine par une preuve vérifiable, pas par une affirmation. On ne présente jamais une métaphore biologique comme une fonctionnalité, et on ne dit jamais "une mission réussie = une décision valide".

Toutes les commandes ci-dessous ont été vérifiées contre le dépôt (voir les rapports d'exploration des agents : CLI Rust, orchestrateur, MCP, tests, docs ETT/SHEV/ontogenèse).

---

## Principe

Une démonstration vaut par ses **preuves** (receipts, snapshots, checkpoints, logs, tests verts), pas par ses promesses. À chaque phase :

1. on exécute une commande concrète du dépôt ;
2. on collecte l'artefact produit ;
3. on vérifie un critère de sortie (gate) ;
4. on décide : passer à la phase suivante, ou revenir en arrière.

Si une phase échoue, on s'arrête et on documente l'échec (mémoire négative vérifiée, cf. ADR 0557).

---

## Prérequis (une seule fois)

```powershell
# À la racine du dépôt (PowerShell)
npm ci
npm ci --prefix backend
cp .env.example .env   # remplir avec des valeurs locales, ne jamais committer
```

Vérifier que le code passe la gate qualité avant toute démo :

```powershell
python scripts/ci/check_code_quality.py   # ou npm run check:code-quality
```

> **Limite connue sur cet environnement Windows :** `cargo test --workspace` échoue (dépendance `aws-lc-sys v0.45.0` : NASM mannant + échec vérification C sous MSVC). Ne pas inclure `cargo test --workspace` comme gate obligatoire. `cargo build --workspace` et les suites de test Node sont les cibles réalistes.

---

## Phase 0 — L'environnement est sain

**But :** prouver que le dépôt se build et que les suites de test Node passent.

| Commande | Ce qu'elle vérifie |
|----------|--------------------|
| `cargo build --workspace` | Cœur Rust compile (store, cellule, biologie, orchestration, CLI `genos`, MCP) |
| `npm test` | Suites Node : biology, worker-workspaces, P1-V3, garage, backend |
| `npm --prefix backend run test:validation` | Suite de validation backend |
| `npm --prefix backend run test:mcp` | Suite MCP backend |
| `curl http://localhost:4000/healthz` (après `npm --prefix backend start`) | Backend REST levé, health probe OK |

**Gate de sortie :** `npm test` vert, `/healthz` répond `200`.  
**Ce qu'on ne claim pas encore :** qu'une mission agentique aboutit.

---

## Phase 1 — Une première mission pilotée par l'orchestrateur

**But :** faire tourner une mission GenOS bout en bout et en conserver le reçu.

Deux entrées possibles :

```powershell
# Aide du CLI Rust (binaire s'appelle "genos")
cargo run -p genos-cli -- --help
cargo run -p genos-cli -- run --help

# Exécuter une mission via le CLI Rust
cargo run -p genos-cli -- run --mission "Démonstration phase 1 : un pas GenOS" --mode trinity

# Exécuter une mission via l'orchestrateur Node (background)
node backend/bin/genos-orchestrate.cjs '{"mission":"Démonstration phase 1 : un pas GenOS","background":true}'

# Exécuter une mission via l'orchestrateur Node (foreground, attend la fin)
node backend/bin/genos-orchestrate.cjs '{"mission":"Démonstration phase 1 : un pas GenOS"}'
```

**Preuves à collecter :**
- ID de mission et statut retourné (orchestrateur) ou output du CLI `genos run` ;
- Logs dans `orchestrator-run.log` à la racine et `backend/runner-logs/` (fichiers `worker_mcp_orchestrator_*.log`) ;
- Réception du worker si la mission en émet un.

**Gate de sortie :** la mission a un identifiant, un statut persistant, et un reçu ou un log d'exécution consultable via GenOS Studio (`integrations/studio/README.md`) ou l'API REST.  
**Ce qu'on ne claim pas :** que la mission a "résolu" quoi que ce soit ; seulement qu'elle a été exécutée et tracée.

---

## Phase 2 — Snapshot, fork et replay (provenance)

**But :** démontrer la traçabilité et la reprise, deux piliers de GenOS.

### 2a. Créer un snapshot (CLI Rust)

Le CLI Rust prend ici un **chemin de fichier JSON/YAML de génome**, pas un identifiant d'agent issu de la base. Ce snapshot CLI est une projection de génome avec un état initial ; il ne capture pas l'état runtime durable. Utiliser l'API REST de la section 2b pour ce dernier.

```powershell
# Fournir un fichier AgentGenome JSON/YAML lié à l'agent choisi
$agentGenome = "artifacts/demo-phase-2/agent-genome.json"
cargo run -p genos-cli -- snapshot create --agent $agentGenome --out "artifacts/demo-phase-2/snapshot-001.json"

# Lister les snapshots du dossier local snapshots/ (pas les fichiers écrits sous artifacts/)
cargo run -p genos-cli -- snapshot list

# Valider un fichier snapshot
cargo run -p genos-cli -- snapshot validate --file "artifacts/demo-phase-2/snapshot-001.json"
```

### 2b. Créer un snapshot via l'API REST (backend)

```powershell
# Démarrer le backend si ce n'est pas déjà fait
npm --prefix backend start

# Capturer un snapshot d'agent (l'ID de l'agent passe dans le corps de la requête, pas dans l'URL)
Invoke-RestMethod -Uri "http://localhost:4000/api/agents/snapshot" -Method Post -Body '{"agentId":"<agent-id>"}' -ContentType "application/json"
```

### 2c. Rejouer (replay) et comparer

```powershell
# Replay via l'API REST
Invoke-RestMethod -Uri "http://localhost:4000/api/agents/replay" -Method Post -Body '{"agentId":"<agent-id>","snapshotId":"<snapshot-id>","apply":true}' -ContentType "application/json"

# Diff de deux snapshots (CLI Rust)
cargo run -p genos-cli -- diff "artifacts/demo-phase-2/snapshot-a.json" "artifacts/demo-phase-2/snapshot-b.json"
```

Le replay REST exige l'agent et le snapshot ; `apply: true` exécute le replay et permet la vérification de l'état réappliqué. Sans cela, l'endpoint reste en mode preview. L'appliquer sur une base et un workspace isolés pour ne pas réécrire l'état d'un environnement actif.

**Preuves à collecter :**
- Snapshot REST : `organismSnapshot.schemaVersion` (4 ou 5), `workspaceSnapshotId` et hash du workspace ; `topologySnapshot` seulement si l'agent dispose réellement d'une topologie capturable ;
- État runtime : statut/hash du composant `runtime`. Revendiquer un `runtimeCheckpointId` uniquement si un checkpoint resumable est effectivement présent ; ne pas assimiler un identifiant de ligne runtime à un checkpoint ;
- Reçu du replay REST : `snapshotId`, `status`, `replayVerified`, `stateDigest` et `liveDigest` ;
- Diff CLI des deux snapshots de génome, en indiquant séparément qu'il ne représente pas le replay du runtime.

**Gate de sortie :** le replay produit un reçu identique ou explicitement différencié, traçable jusqu'au snapshot d'origine.  
**Ce qu'on ne claim pas :** que la RAM du processus ou le contexte caché du fournisseur LLM est restauré ; ni qu'une topologie ou un checkpoint resumable existe si le snapshot ne les contient pas (cf. README : un snapshot restaure les états durables couverts par son manifeste, ni la RAM arbitraire ni l'état caché du provider).

---

## Phase 3 — Arbitrage explicite : ACT / OBSERVE / LEARN / NO_CHANGE

**But :** montrer que le service de stewardship choisit explicitement un mode selon l'incertitude, le budget et les permissions.

La politique est déterministe et couverte par un test des quatre modes :

```powershell
node backend/tests/test_trajectory_stewardship_policy.js
node backend/tests/test_trajectory_stewardship_store.js
node backend/tests/test_trajectory_stewardship_outcome.js
```

Pour démontrer une décision durable, fournir une trajectoire incertaine au service `trajectoryStewardshipPolicyService.js`, puis passer le résultat `OBSERVE` à `trajectoryStewardshipStoreService.js`. Vérifier le reçu dans le scope organisation/projet et après réouverture de la base. Le store accepte les objectifs actionnables `ACT`, `OBSERVE` et `LEARN`, mais rejette `NO_CHANGE` (`TRAJECTORY_STEWARDSHIP_NO_ACTION`).

**Preuves à collecter :** mode/candidat, motif, références à l'observation et à l'objectif, reçu de responsabilité, lecture après redémarrage. La preuve doit rester dans un scope de démonstration isolé ; ce n'est pas un événement d'historique générique d'orchestration.
**Gate de sortie :** au moins une décision `OBSERVE` a été explicitement sélectionnée et persistée avec son motif. `NO_CHANGE` peut être démontré au niveau de la politique, mais sa persistance n'est pas prise en charge par ce store.
**Ce qu'on ne claim pas :** que l'arbitrage est appris empiriquement (la politique reste déterministe/configurée), ni qu'une décision `NO_CHANGE` est enregistrée dans le journal durable des responsabilités.

---

## Phase 4 — ETT : une chaîne de contrôle falsifiable (la plus démonstrable aujourd'hui)

**But :** démontrer l'Endogenous Thought Test v1, que GenOS présente comme sa chaîne de contrôle durable et falsifiable la plus concrète.

Voir `docs/01-concepts/endogenous-thought-test.md` (protocole PR1→PR8) et ADR 0626 / 0646 / 0647.

```powershell
# Contrats et services ETT (13 fichiers)
npm --prefix backend run test:ett

# Campagne de développement agrégée ; utiliser une DB jetable et un mot de passe
# bootstrap temporaire dans l'environnement du processus.
$run = "artifacts/demo-phase-4/run-<id>"
New-Item -ItemType Directory -Force $run | Out-Null
$env:GENOS_DISABLE_DOTENV = "1"
$env:GENOS_DB_PATH = (Join-Path (Get-Location) "$run/ett-campaign.db")
$env:GENOS_ADMIN_PASSWORD = [guid]::NewGuid().ToString("N")
node backend/bin/genos-ett-campaign.cjs --output "$run/ett-campaign-receipt.json"
Remove-Item Env:GENOS_DISABLE_DOTENV, Env:GENOS_DB_PATH, Env:GENOS_ADMIN_PASSWORD
```

**Preuves à collecter :**
- Détection de la question falsifiable ;
- Admission AGOW, exécution reprenable, vérification indépendante Ed25519 ;
- Apprentissage d'épisode borné (`maxCycles ≤ 10`) ;
- Reçus individuels run/vérification/apprentissage, liés au même `runId`, épisode et tenant, avec `promotionEligible: false` ; vérifier leur contrat et leur persistance après redémarrage de la DB.
- Reçu agrégé de campagne de développement, séparé des reçus de cycle.

Le reçu de `genos-ett-campaign.cjs` est une agrégation de développement : `holdout: false`, `evidenceStatus: development_only`, `publishable: false` et `promotionDecision` peut être `null`. Il ne prouve pas à lui seul le lien run/tenant ; collecter les reçus d'un cycle ETT individuel pour ce gate.

**Gate de sortie :** un cycle ETT complet a produit des reçus individuels vérifiables liés au run et au tenant, et chaque reçu indique la non-éligibilité à la promotion.
**Ce qu'on ne claim pas :** une cognition générale, ni une activation en production (explicitement indisponible, `scientificEvidence: false`, campagne sur corpus réservé non exécutée).

---

## Phase 5 — Boucle longitudinale : ontogenèse dirigée par responsabilité

**But :** montrer la boucle complète : mandat → observation → arbitrage → exécution isolée → vérification → apprentissage → révision du mandat.

Voir `docs/01-concepts/ontogenese-dirigee-par-responsabilite.md` (boucle 6 phases A→F, modèle formel, double preuve causale).

Reprendre la mission Phase 1 avec son identifiant et ses empreintes d'évidence. Garder son workspace source en lecture seule ; copier les entrées nécessaires dans un workspace candidat isolé. Le cycle doit enregistrer un contrat, une hypothèse falsifiable, une opération, les artefacts, la vérification indépendante, l'arbitrage de stewardship et la révision du contrat.

Si le candidat est vérifié mais n'a ni intégration autorisée ni preuve d'effet post-intégration, `NO_CHANGE` est le résultat attendu : restaurer la copie isolée et réviser le mandat pour exiger explicitement ces preuves avant adoption. Une exécution ou des tests réussis dans la copie ne sont pas une preuve d'effet projet.

Vérifications ciblées des contrats utilisés :

```powershell
node backend/tests/test_ontogenesis_repository_stewardship.js
node backend/tests/test_ontogenesis_durable_foundation.js
node backend/tests/test_ontogenesis_crash_recovery.js
```

**Preuves à collecter :**
- Journal d'opérations et registre d'artefacts (ADR 0606), relus après redémarrage de la DB ;
- Reçu de vérification indépendante lié au candidat et aux empreintes sources ;
- Décision `ADOPT` ou `NO_CHANGE` avec justification fondée sur l'effet post-intégration ;
- Révision versionnée du mandat et confirmation que le workspace source reste inchangé.

**Gate de sortie :** le mandat a été révisé sur la base des preuves d'exécution et d'effet disponibles, et la décision de maintien/rollback est persistée. `NO_CHANGE` satisfait le gate lorsque l'intégration ou la preuve d'effet manque et que le candidat est restauré.
**Ce qu'on ne claim pas :** que la boucle longitudinale est qualifiée sur plusieurs projets réels (qualification en cours, cf. README).

---

## Phase 6 — Serveur MCP avec lease (sécurité fail-closed)

**But :** démontrer que les outils MCP ne sont exposés que sous un bail explicite (fail-closed).

```powershell
# Vérifier catalogue, contrats, transports et parité Node/Rust
npm --prefix backend run test:mcp

# Construire le serveur Rust
cargo build -p genos-mcp

# Lancer chaque serveur stdio et envoyer initialize puis tools/list/tools/call.
# Sans lease : tools/list vide et tools/call refusé avec MCP_TOOL_LEASE_DENIED.
# Avec lease : utiliser exactement la allow-list du client Codex .mcp.json.
$env:GENOS_MCP_LEASE = "genos_snapshot,genos_replay,genos_capsule_create,genos_execute_primitive,genos_execute_strategy_pipeline,genos_search_failures,genos_diagnose,genos_analyze_trajectory,genos_record_decision,genos_record_experience,genos_compile_memory,genos_blame,genos_orchestrate,genos_organization_state,genos_report_progress,genos_audit"
$env:GENOS_MCP_TOOL_TIMEOUT_MS = "120000"
```

**Preuves à collecter :**
- Liste d'outils vide sans `GENOS_MCP_LEASE` ;
- Appel MCP hors lease refusé par `MCP_TOOL_LEASE_DENIED` ;
- Catalogue d'outils disponible avec le lease (16 outils dans `.mcp.json`) ;
- Même liste de lease exposée par Node et Rust ; un appel sous lease passe le contrôle de lease, même si les arguments de la sonde sont ensuite rejetés.
- Parité de catalogue/contrats : `npm --prefix backend run test:mcp`.

**Gate de sortie :** sans lease, `tools/list` retourne une liste vide ; avec lease, les outils déclarés sont accessibles.  
**Ce qu'on ne claim pas :** que le MCP contourne le sandbox ou le circuit breaker.

---

## Phase 7 — Répétition générale de campagne terrain SHEV (non qualifiante)

**But :** valider le chemin d'exécution d'une campagne appariée, de manière accélérée et explicitement non qualifiante.

Suivre le runbook `docs/04-exploitation/repetition-generale-campagne-terrain-shev.md`.

```powershell
# Prérequis : brouillon de protocole pilote, 2 projets + 2 workspaces jetables,
# producteur/oracle/vérificateur séparés, campaignId suffixé -rehearsal
# Étapes : prepare → seal → exécution par tick → injection de 8 pannes obligatoires → export
```

**Pannes obligatoires à injecter (huit scénarios distincts, comme dans le runbook) :**
1. arrêt après exécution, avant journalisation ;
2. arrêt après journalisation, avant réponse ;
3. deux `tick` concurrents ;
4. reçu producteur utilisé comme vérification (refus d'indépendance) ;
5. digest d'artefact altéré ;
6. dérive de verrou runtime ;
7. dépassement de budget cumulé ;
8. tâche réservée injectée en apprentissage.

**Critères d'acceptation :** arrêt+reprise sans doublon, ticks concurrents n'ajoutent pas deux runs, contre-preuves refusées, budgets recoupés, export reconstructible en lecture seule, tiers peut expliquer le verdict, aucune sortie avec `field_evidence_complete`, aucun `.db`/secret/artefact volumineux dans Git.

**Preuves à collecter :** reçus immuables, reprise idempotente (ADR 0602), scellement shadow/holdout, rapport sanitisé.  
**Gate de sortie :** la campagne a pu être exécutée de bout en bout et a produit un rapport sanitaire honnête.  
**Ce qu'on ne claim pas :** que la campagne est concluante (elle ne doit pas être présentée comme telle avant le verdict final de la campagne terrain SHEV scellée).

---

## Tableau récapitulatif

| Phase | Ce qu'on démontre | Commande clé | Preuve clé | Ce qu'on NE claim pas |
|-------|-------------------|--------------|------------|-----------------------|
| **0** | Dépôt buildable et testable | `cargo build --workspace`, `npm test`, `curl /healthz` | Tests Node verts, health probe 200 | Fonctionnement agentique |
| **1** | Mission exécutée et reçue | `cargo run -p genos-cli -- run --mission "..."` ou `node backend/bin/genos-orchestrate.cjs` | ID de mission, statut, reçu/log | Résolution du problème |
| **2** | Snapshot / fork / replay traçable | `genos snapshot create`, `POST /agents/snapshot`, `POST /agents/replay`, `genos diff` | Manifeste, `runtimeCheckpointId`, diff | Restauration RAM / contexte LLM |
| **3** | Arbitrage explicite (ACT/OBSERVE/LEARN/NO_CHANGE) | Mission avec incertitude, API/backend | Décision d'arbitrage consignée | Arbitrage appris empiriquement |
| **4** | Chaîne falsifiable ETT | `npm --prefix backend run test:ett` | Reçu vérifiable, `maxCycles ≤ 10`, `promotionEligible: false` | Cognition générale / production active |
| **5** | Boucle longitudinale (ontogenèse) | Reprise mission phase 1 + révision de mandat | Journal d'opérations, décision maintien/rollback | Qualification multi-projets réels |
| **6** | MCP fail-closed sous lease | `node mcp/index.js` avec/sans `GENOS_MCP_LEASE` | Outils vides sans lease, disponibles avec | Contournement du sandbox |
| **7** | Campagne SHEV répétition générale | `docs/04-exploitation/repetition-generale-campagne-terrain-shev.md` | Rapport sanitisé, verdict honnête | Campagne concluante |

---

## Règles de bonne foi (à respecter pendant la démo)

- **Ne pas sur-vendre :** GenOS est en alpha ; "architecture intégrée, composants testés, qualification longitudinale en cours".
- **Preuve avant décision :** un transport réussi n'est pas une décision valide ; un test vert n'est pas un effet réel.
- **Échec documenté :** si une phase échoue, on consigne l'échec (mémoire négative vérifiée) plutôt de le cacher.
- **Pas de nouveaux outils de qualité :** ne pas ajouter de config ESLint/Prettier ; utiliser la gate existante `scripts/ci/check_code_quality.py`.
- **Docs en français :** si l'on ajoute de la documentation, suivre `docs/CONVENTIONS.md` (kebab-case, familles numérotées).

---

## Comment conserver les preuves

À chaque phase, archiver dans un dossier dédié (ex. `artifacts/demo-phase-<n>/`) :
- la commande exacte exécutée ;
- la sortie stdout/stderr ;
- les reçus, snapshots, checkpoints et diffs produits ;
- le statut du gate (passé/échoué).

> Le dossier `artifacts/` est déjà utilisé par le dépôt (`topology-morphogenesis/`, `trinity-missions/`). Un script `clean:artifacts` (`node scripts/clean-artifacts.mjs`) existe pour le nettoyer — ne pas l'exécuter pendant la démo sans avoir sauvegardé les preuves ailleurs.

Ces artefacts constituent la mémoire épisodique de la démonstration et peuvent être présentés comme preuve que GenOS fonctionne, pas comme promesse qu'il résout tout.
