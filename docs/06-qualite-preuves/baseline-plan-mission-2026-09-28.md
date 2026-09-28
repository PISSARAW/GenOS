# Baseline plan de cablage — 2026-09-28 (Phase 0.1)

Statut : reference de depart du plan d'implementation complet.
Ne promeut aucune capacite. Un controle interrompu ne compte pas comme reussi.

## Coordonnees

- Branche : `v3`, en avance de 2 commits sur `origin/v3` au moment de la capture.
- HEAD : `c43c524d9b064d28c0dcdaefd3d44c28ef5cc9be`
  (`[FEAT] Phase 1.1 schema versionne objets communs bio-runtime`).
- Parent : `c375cc67` (`[DOC] Documente registres dynamiques et appels par configuration`).
- Baseline anterieure : `docs/06-qualite-preuves/baseline-2026-09-28.md`
  (HEAD `2321a9469e6b4dfbd6be0e8a582ab4bda83f684b`).

## Arbre de travail au moment de la capture

`git status --short` (preexistant, exterieur au present plan) :

- `M Cargo.lock`
- `M backend/src/app.js`
- `M backend/src/middleware/idempotency.js`
- `M backend/src/services/agentWorkspaceLifecycle/copy.js`
- `M backend/src/storage/projection/analyticsProjector.js`
- `M backend/src/storage/projection/graphProjector.js`
- `M backend/src/storage/projection/projectionOutbox.js`
- `M backend/src/storage/projection/searchProjector.js`
- `M backend/src/strategies/strategySelectorConstants.js`
- `M backend/src/strategies/strategySelectorEligibility.js`
- `M backend/src/strategies/strategySelectorHelpers.js`
- `M backend/tests/test_strategy_trait_scoring.js`
- `M crates/genos-bio-contracts/src/lib.rs`
- `M crates/genos-mcp/src/tools.rs`
- `M mcp/lease.js`
- `M mcp/test_lease.js`
- `M mcp/toolCallHandler.js`
- `?? crates/genos-bio-contracts/src/ids.rs`

Ces modifications restent attribuees au chantier exterieur
(idempotence, selecteur de strategies, contrats bio, bail MCP).
Les lots du present plan seront distingues par un commit par point
sur les seuls fichiers qu'ils touchent (`git add` selectif).

## Configuration de validation

- Node v24.18.0, Python 3.12.10, cargo 1.97.1, rustc 1.97.1.
- Gate qualite : `python scripts/ci/check_code_quality.py`
  (baseline `scripts/ci/quality_baseline.json`, 400 lignes / 3 params / complexite 10).
- Suites prescrites : `npm test` (backend), `cargo test --workspace`.
- Echecs preexistants a diagnostiquer separement : boucle autonome Rust,
  suite securite, RPC gRPC `AgentService.StartMission`.

## Mesures reproductibles sur ce checkout

- `node scripts/ci/audit_service_reachability.js --json` :
  total **1820**, atteignables statiques **1313**,
  non atteignables **507**, sans import litteral **310**.
- Derive vs baseline anterieure (1819/1313/506/309) : **+1 service**,
  sans import litteral +1. Cause a identifier en Phase 1, sans deduire
  qu'il s'agit d'un service mort.
- `shared/toolDefinitions.json` = **36** outils,
  `mcp/toolDefinitions.json` = **36** outils.

## Cloture Phase 0.1

Resultat reproductible ou blocage attribue exiges pour chaque controle
avant toute campagne de performance ou promotion de capacite.
Le point suivant (Phase 0.2) rejoue les controles et consigne
commandes, sorties, versions et portee.
