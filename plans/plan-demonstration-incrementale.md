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

```powershell
# Créer un snapshot d'un agent (remplacer <agent-id> par un id réel, ex. issu de la phase 1)
cargo run -p genos-cli -- snapshot create --agent <agent-id> --out "artifacts/demo-phase-2/snapshot-001.json"

# Lister les snapshots locaux
cargo run -p genos-cli -- snapshot list

# Valider un fichier snapshot
cargo run -p genos-cli -- snapshot validate --file "artifacts/demo-phase-2/snapshot-001.json"
```

### 2b. Créer un snapshot via l'API REST (backend)

```powershell
# Démarrer le backend si ce n'est pas déjà fait
npm --prefix backend start

# Capturer un snapshot d'agent (l'ID de l'agent passe dans le corps de la requête, pas dans l'URL)
Invoke-RestMethod -Uri "http://localhost:4000/agents/snapshot" -Method Post -Body '{"agentId":"<agent-id>"}' -ContentType "application/json"
```

### 2c. Rejouer (replay) et comparer

```powershell
# Replay via l'API REST
Invoke-RestMethod -Uri "http://localhost:4000/agents/replay" -Method Post -Body '{"snapshotId":"<snapshot-id>"}' -ContentType "application/json"

# Diff de deux snapshots (CLI Rust)
cargo run -p genos-cli -- diff "artifacts/demo-phase-2/snapshot-a.json" "artifacts/demo-phase-2/snapshot-b.json"
```

**Preuves à collecter :**
- Manifeste du snapshot (version 4 ou 5 avec `topologySnapshot`) ;
- Référence de checkpoint logique (`runtimeCheckpointId`) ;
- Diff entre le reçu original et le reçu du replay.

**Gate de sortie :** le replay produit un reçu identique ou explicitement différencié, traçable jusqu'au snapshot d'origine.  
**Ce qu'on ne claim pas :** que la RAM du processus ou le contexte caché du fournisseur LLM est restauré (cf. README : un snapshot restaure les états durables couverts par son manifeste, ni la RAM arbitraire ni l'état caché du provider).

---

## Phase 3 — Arbitrage explicite : ACT / OBSERVE / LEARN / NO_CHANGE

**But :** montrer que GenOS choisit explicitement une action, plutôt que d'exécuter aveuglément.

Lancer une mission où l'agent rencontre une incertitude, et vérifier que l'arbitrage est consigné :

- `ACT` → exécution dans un workspace isolé avec budget et lease ;
- `OBSERVE` → pas de mutation, seule observation sourcée ;
- `LEARN` → apprentissage d'épisode persiste, non promu automatiquement ;
- `NO_CHANGE` → décision de ne rien changer, tracée.

L'arbitrage est implémenté côté backend via les services de stewardship de trajectoire (`trajectoryStewardshipPolicyService.js`, `trajectoryStewardshipOutcomeService.js`) et couvert par les tests (`test_trajectory_stewardship_policy.js`, `test_trajectory_stewardship_outcome.js`).

**Preuves à collecter :** la décision d'arbitrage dans l'historique de mission, avec le motif (frais, incertitude, consentement, révocabilité).  
**Gate de sortie :** au moins une décision `NO_CHANGE` ou `OBSERVE` a été prise et consignée, prouvant que l'exécution n'est pas automatique.  
**Ce qu'on ne claim pas :** que l'arbitrage est appris empiriquement (plusieurs politiques restent déterministes/configurées, cf. README).

---

## Phase 4 — ETT : une chaîne de contrôle falsifiable (la plus démonstrable aujourd'hui)

**But :** démontrer l'Endogenous Thought Test v1, que GenOS présente comme sa chaîne de contrôle durable et falsifiable la plus concrète.

Voir `docs/01-concepts/endogenous-thought-test.md` (protocole PR1→PR8) et ADR 0626 / 0646 / 0647.

```powershell
# Suites de test ETT (13 fichiers)
npm --prefix backend run test:ett

# Campagne de développement ETT (exécutable)
# Voir genos-ett-campaign.cjs et docs/01-concepts/endogenous-thought-test.md
```

**Preuves à collecter :**
- Détection de la question falsifiable ;
- Admission AGOW, exécution reprenable, vérification indépendante Ed25519 ;
- Apprentissage d'épisode borné (`maxCycles ≤ 10`) ;
- Réception liée au run et au tenant, `promotionEligible: false`.

**Gate de sortie :** un cycle ETT complet a produit un reçu vérifiable, et la décision de promotion (ou de non-promotion) est explicite.  
**Ce qu'on ne claim pas :** une cognition générale, ni une activation en production (explicitement indisponible, `scientificEvidence: false`, campagne sur corpus réservé non exécutée).

---

## Phase 5 — Boucle longitudinale : ontogenèse dirigée par responsabilité

**But :** montrer la boucle complète : mandat → observation → arbitrage → exécution isolée → vérification → apprentissage → révision du mandat.

Voir `docs/01-concepts/ontogenese-dirigee-par-responsabilite.md` (boucle 6 phases A→F, modèle formel, double preuve causale).

Reprendre la mission de la phase 1, appliquer un cycle d'ontogenèse, puis réviser le mandat selon le résultat (maintenir ou rollback).

**Preuves à collecter :**
- Journal d'opérations et registre d'artefacts (ADR 0606) ;
- Reçu de vérification indépendante ;
- Décision de maintien/rollback avec justification.

**Gate de sortie :** le mandat a été révisé sur la base d'une preuve, pas sur le seul succès du transport.  
**Ce qu'on ne claim pas :** que la boucle longitudinale est qualifiée sur plusieurs projets réels (qualification en cours, cf. README).

---

## Phase 6 — Serveur MCP avec lease (sécurité fail-closed)

**But :** démontrer que les outils MCP ne sont exposés que sous un bail explicite (fail-closed).

```powershell
# 1. Sans lease : aucun outil exposé (fail-closed)
node mcp/index.js
# → ListTools retourne une liste vide, tout appel d'outil est rejeté (MCP_TOOL_LEASE_DENIED)

# 2. Avec lease (exemple du client Codex .mcp.json)
$env:GENOS_MCP_LEASE = "genos_snapshot,genos_replay,genos_capsule_create,genos_execute_primitive,genos_execute_strategy_pipeline,genos_search_failures,genos_diagnose,genos_analyze_trajectory,genos_record_decision,genos_record_experience,genos_compile_memory,genos_blame,genos_orchestrate,genos_organization_state,genos_report_progress,genos_audit"
$env:GENOS_MCP_TOOL_TIMEOUT_MS = "120000"
node mcp/index.js
# → ListTools retourne les outils du lease, exécutables via CallTool

# 3. Variante Rust
cargo run -p genos-mcp
```

**Preuves à collecter :**
- Liste d'outils vide sans `GENOS_MCP_LEASE` ;
- Catalogue d'outils disponible avec le lease (16 outils dans `.mcp.json`) ;
- Parité Node / Rust : `npm --prefix backend run test:mcp` ou `node backend/tests/test_mcp_server_parity.js`.

**Gate de sortie :** sans lease, `tools/list` retourne une liste vide ; avec lease, les outils déclarés sont accessibles.  
**Ce qu'on ne claim pas :** que le MCP contourne le sandbox ou le circuit breaker.

---

## Phase 7 — Répétition générale de campagne terrain SHEV (non qualifiante)

**But :** valider le chemin d'exécution d'une campagne appariée, de manière accélérée et explicitement non qualifiante.

Suivre le runbook `docs/04-exploitation/repetition-generale-campagne-terrain-shev.md`.

```powershell
# Prérequis : brouillon de protocole pilote, 2 projets + 2 workspaces jetables,
# producteur/oracle/vérificateur séparés, campaignId suffixé -rehearsal
# Étapes : prepare → seal → exécution par tick → injection de 7 pannes obligatoires → export
```

**Pannes obligatoires à injecter :**
1. arrêt avant/après journalisation ;
2. deux `tick` concurrents ;
3. reçu producteur utilisé comme vérification (refus d'indépendance) ;
4. digest d'artefact altéré ;
5. dérive de verrou runtime ;
6. dépassement de budget ;
7. tâche réservée injectée en apprentissage.

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
