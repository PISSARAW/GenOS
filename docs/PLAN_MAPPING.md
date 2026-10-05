# Plan-to-Codebase Mapping: GenOS V3 Architecture Plan

This document maps each lot from the architecture plan to existing implementations in the GenOS V3 codebase.

## Legend
- ✅ **Implemented** - Working code exists with tests
- 🔄 **Partial** - Core structures exist, needs completion
- 📋 **Planned** - ADR exists but implementation pending
- ❌ **Missing** - Not yet started

---

## Lot A — Épistémologie et limites de preuve

| Concept | Status | Location | Notes |
|---------|--------|----------|-------|
| Conscience subjective | 📋 ADR 0027, 0134, 0147-0152 | `docs/adr/0027-adaptateurs-conscience-et-metaphysique.md`, `crates/genos-orchestrator/src/conscience.rs` | Adaptateurs bornés pour conscience ; indicateurs comportementaux seulement |
| Qualia | 📋 ADR 0027 | `docs/adr/0027-adaptateurs-conscience-et-metaphysique.md` | Non spécifié comme propriété à démontrer |
| Intentionnalité réelle | 📋 ADR 0019, 0020a, 0023 | `docs/adr/0019-socle-epistemique-du-savoir.md` | Socle épistémique, moteurs logiques bornés |
| Réalité indépendante | 📋 ADR 0023 | `docs/adr/0023-pont-causalite-modalite.md` | Pont borné causalité/modalité |
| Causalité réelle | 📋 ADR 0023, 0179, 0272b | `crates/genos-orchestrator/src/trace.rs` | Causalité procédurale durable, Self-Twin |
| Vérité déduite du succès | 📋 ADR 0024, 0025 | `docs/adr/0024-contexte-epistemique-scientifique.md` | Fiabilité cognitive bornée |
| Reproduction biologique littérale | ✅ | `crates/genos-reproduction/`, `crates/genos-orchestrator/src/reproduction_cycle.rs` | Reproduction computationnelle, pas biologique |

**Livrables existants:**
- ✅ Registre des affirmations : `docs/adr/` (280+ ADRs)
- ✅ Vocabulaire contrôlé : ADR 0016, 0017, 0027
- ✅ Protocole anti-surinterprétation : ADR 0134 (boucles réflexives = indicateurs, jamais conscience)

---

## Lot B — Organismes et systèmes adaptatifs simulés

| Concept | Status | Location | Notes |
|---------|--------|----------|-------|
| Organisme biologique simulé | ✅ | `crates/genos-orchestrator/src/organism.rs`, `crates/genos-orchestrator/src/orchestrator.rs` | `BiomimeticOrchestrator` avec tissus, spores, métabolisme, membrane |
| Immunité épistémique | ✅ | `crates/genos-immune/`, `crates/genos-orchestrator/src/immune_cyber.rs` | AIS, clonal selection, circuit breaker, autotomy |
| Intelligence collective générale | 🔄 | `crates/genos-orchestrator/src/ecosystem.rs`, `crates/genos-signal/` | Kuramoto sync, stigmergie, cascade ; يحتاج اختبارات مقارنة |

**Étapes implémentées:**
1. ✅ Environnement simulé : `crates/genos-orchestrator/src/environment.rs`, `ecosystem.rs`
2. ✅ Perception, homéostasie, reproduction : `crates/genos-cell/`, `genos-reproduction/`, `genos-biology/`
3. ✅ Agents spécialisés : `crates/genos-orchestrator/src/specialized_cell_runtime.rs` (choanocyte, cnidocyte, trachéide, etc.)
4. 🔄 Métriques robustesse/adaptation : tests dans `crates/genos-orchestrator/tests/`
5. 🔄 Comparaison baselines : `backend/tests/test_apex_adversarial_defense_bench.js`, etc.
6. ✅ Appellation « organisme computationnel » : utilisée dans le code

---

## Lot C — Orchestration, promotion et gouvernance

| Concept | Status | Location | Notes |
|---------|--------|----------|-------|
| Autonomie illimitée orchestrateur | ❌ **Interdit** | ADR 0012b, 0045, 0044 | Autorité bornée, leases, veto constitutionnel |
| Auto-autorisation promotion | ❌ **Interdit** | `crates/genos-orchestrator/src/kernel_governance.rs` | `GovernancePlane::validate()` refuse si pas d'approbation |
| Superviseur redémarrage seul | 🔄 | `crates/genos-orchestrator/src/kernel_cycle.rs`, `director.rs` | Nécessite approbation externe pour changements sensibles |
| Certification inter-modèles | 📋 | ADR 0035, 0269 | GMUB/GCAB benchmarks, protocoles rivals |

**Implémenté:**
- ✅ Machine à états agents/permissions : `kernel_governance.rs`, `kernel_morphogenesis_lease.rs`
- ✅ Leases, timeouts, budgets : `token_bucket.rs`, `kernel_morphogenesis_lease.rs`, `crates/genos-signal/`
- ✅ Séparation proposition/validation/exécution : `kernel_morphogenesis.rs` pipeline
- ✅ Interdiction promotion auto-accordée : `kernel_governance.rs:53-58`
- ✅ Autorisation externe/multi-sig : `principal_authority`, `approbation_humaine`
- ✅ Journalisation décisions : `trace.rs`, `durable_receipts.rs`, `crates/genos-store/src/event.rs`
- 🔄 Tests panne/boucle/escalade : `crates/genos-orchestrator/tests/orchestrator.rs`, `kernel_control.rs`

---

## Lot D — Web, bureau et interaction avec le monde

| Concept | Status | Location | Notes |
|---------|--------|----------|-------|
| Boucle Web incarnée | 🔄 | `crates/genos-sensorimotor/`, `backend/tests/test_web_journey_verifier.js` | Vision fovéale ADR 0182a/0185, navigation session explicite |
| Navigation Web autonome | 🔄 | `backend/tests/test_foraging_browser_runtime.js`, `test_browser_scout.js` | Allowlists, sandbox, confirmation humaine |
| Contrôleur universel bureau | 🔄 | `crates/genos-sensorimotor/src/lib.rs` | Enigo + UIAutomation ; renommer « contrôleur multi-application sous contrat » |

**Étapes:**
1. ✅ Environnements simulés/sites test : `backend/tests/test_web_audit_sensors.js`
2. ✅ Perception interface, planification : `genos-sensorimotor`, `backend/src/services/foraging*`
3. ✅ Allowlists, sandbox : `backend/src/middleware/security.js`, `mcp/lease.js`
4. 🔄 Traces reproductibles : `test_web_journey_verifier.js` (captures, événements)
5. 🔄 Vérification intention/action/état : `test_foveal_vision.js`
6. 🔄 Tests interruptions/erreurs : `test_chaos_engineering_and_resilience_bench.js`
7. ❌ Extension environnements réels faible risque : en attente

---

## Lot E — Réparation, autofix et historique

| Concept | Status | Location | Notes |
|---------|--------|----------|-------|
| Réparation autonome sans lease | ❌ **Interdit** | ADR 0197, `mcp/lease.js` | Tout écriture requiert lease ; HGT sous lease + révocation |
| Autofix historique modification auto | ❌ **Interdit** | ADR 0145, 0253 | Rollout contrôlé réversible, monitoring somatique GVX |

**Implémenté:**
- ✅ Lease obligatoire écriture : `mcp/lease.js:39-50` (fail-closed), `kernel_morphogenesis_lease.rs`
- ✅ Worktrees/snapshots isolés : `crates/genos-store/src/snapshot.rs`, `continuation_wal.rs`
- ✅ Périmètre autorisé : `kernel_morphogenesis.rs` plan validation
- ✅ Tests, analyse statique, vérif différentielle : `backend/tests/test_property_invariants.js`, `test_procedural_causal_validation.js`
- ✅ Validation avant intégration : `kernel_governance.rs`, `kernel_morphogenesis.rs`
- ✅ Conservation patch/justification/rollback : `durable_receipts.rs`, `snapshot.rs`, `fossil.rs`
- ✅ Réparations réversibles bornées : `clinical_therapy.rs`, `authorized_therapy.rs`

---

## Lot F — Composition et convergence multi-agents

| Concept | Status | Location | Notes |
|---------|--------|----------|-------|
| Convergence CRDT | 📋 | ADR 0030, 0177 | Immunité épistémique + composition résultats ; pas CRDT classique |
| Lois algébriques composition | 📋 | ADR 0090a, 0131, 0133 | Contrats capacités Syncytium, graphe morphologique exécutable |
| Certifications performances | 🔄 | ADR 0035, 0269, 0251 | GMUB/GCAB, benchmarks AGOW, protocoles comparatifs |
| Parité AutoGen | 🔄 | `backend/tests/test_rival_challenge.js`, `test_bfcl_benchmark.js` | Tests adversariaux vs frameworks externes |

**Étapes:**
1. 📋 Calcul formel composition : ADR 0133 (graphe morphologique + plugins topologies)
2. 📋 Propriétés attendues : ADR 0051 (contrats typés topologie), ADR 0092 (topologies imbriquées)
3. 🔄 Contre-exemples : `backend/tests/test_real_world_adversarial_attacks.js`
4. 📋 Preuves sous hypothèses : ADR 0281a (preuves résolvables ou rien)
5. 🔄 Tests charges/topologies : `backend/tests/stress/*.js`
6. 🔄 Comparaison frameworks : `test_rival_challenge.js`, `test_bfcl_benchmark.js`, `test_gaia_benchmark.js`
7. ✅ Résultats conditionnels : ADR 0022b, 0113 (jamais certification générale)

---

## Infrastructure Commune (Item 3 du plan)

| Composant | Status | Location | Notes |
|-----------|--------|----------|-------|
| Journal événements append-only | ✅ | `crates/genos-store/src/event.rs`, `continuation_wal.rs` | `InMemoryEventStore`, `ContinuationWal` |
| Identités/permissions par agent | ✅ | `backend/src/middleware/auth.js`, `tenant.js`, `crates/genos-orchestrator/src/kernel_governance.rs` | ABAC Cedar, tenant scope |
| Leases et révocation | ✅ | `mcp/lease.js`, `crates/genos-orchestrator/src/kernel_morphogenesis_lease.rs` | Fail-closed, expiration, disabled tools |
| Sandbox exécution | ✅ | `backend/src/middleware/security.js`, `crates/genos-orchestrator/src/process_sandbox.rs` | Isolation modes: Branch, VFS_Branch, Snapshot |
| Snapshots et restauration | ✅ | `crates/genos-store/src/snapshot.rs`, `cryptobiosis.rs`, `continuation_wal.rs` | `SnapshotStore`, vitrified freeze/thaw |
| Simulateur environnements | 🔄 | `crates/genos-orchestrator/src/environment.rs`, `ecosystem.rs`, `worlds.rs` | Mondes physiques, niches, ressources |
| Registre hypothèses | 📋 | ADR 0268, 0281a | Ledger preuves scientifiques, preuves résolvables |
| Registre preuves | ✅ | `crates/genos-store/src/fossil.rs`, `biological_receipt.rs` | Fossilisation stratigraphique, reçus biologiques |
| Générateur scénarios adversariaux | 🔄 | `backend/tests/stress/test_apex_adversarial_defense_bench.js`, `test_real_world_adversarial_attacks.js` | Tests stress, chaos engineering |
| Évaluations reproductibles | 🔄 | `backend/tests/run_quality_suite.js`, `test_property_invariants.js` | Suites validation, propriétés |
| Tableaux métriques | 🔄 | `crates/genos-orchestrator/src/physical_telemetry.rs`, `orchestrator_monitoring.rs` | Télémétrie physique, monitoring |
| Désactivation urgence | ✅ | `crates/genos-immune/src/cyber_immune.rs` | `CircuitBreaker`, `AutotomyModule` (autotomie) |

---

## Niveaux de Maturité (Item 4)

| Niveau | Critère | Exemples dans codebase |
|--------|---------|------------------------|
| 0 - Concept | Définition + limites | ADR proposés (0004, 0040, 0124) |
| 1 - Prototype simulé | Démo environnement contrôlé | `crates/genos-orchestrator/tests/organism.rs`, `ecosystem.rs` |
| 2 - Test reproductible | Métriques + baselines | `backend/tests/test_property_invariants.js`, `run_validation_suite.js` |
| 3 - Pilote borné | Déploiement limité, supervision | `backend/bin/genos-orchestrate.cjs`, `mcp/index.js` (lease requis) |
| 4 - Système auditable | Traces complètes, rollback, revue | `crates/genos-store/` (fossil, snapshot, receipt), `durable_receipts.rs` |
| 5 - Déploiement opérationnel | Propriétés vérifiables, périmètre défini | **En cours** - nécessite validation indépendante |

**Règle :** Aucun concept métaphysique > « indicateur comportemental documenté » (ADR 0134, 0027)

---

## Ordre Recommandé (Item 5) — État d'avancement

| Ordre | Action | Status |
|-------|--------|--------|
| 1 | Formaliser définitions et limites | ✅ ADRs 0016, 0017, 0019-0025, 0027, 0134 |
| 2 | Construire logs, permissions, leases, sandbox | ✅ `genos-store`, `genos-immune`, `mcp/lease.js`, `kernel_governance.rs` |
| 3 | Orchestration bornée + promotion contrôlée | ✅ `kernel_morphogenesis.rs`, `kernel_governance.rs`, `kernel_morphogenesis_lease.rs` |
| 4 | Simulation multi-agents + organismes computationnels | ✅ `genos-orchestrator` (organism, ecosystem, specialized cells) |
| 5 | Réparation réversible | ✅ `clinical_therapy.rs`, `authorized_therapy.rs`, `snapshot.rs`, `fossil.rs` |
| 6 | Composition, convergence, performances | 🔄 `genos-signal`, `ecosystem.rs`, benchmarks backend |
| 7 | Web/bureau environnements contrôlés | 🔄 `genos-sensorimotor`, `foraging*`, `web_journey_verifier` |
| 8 | Validations indépendantes | 🔄 `test_rival_challenge.js`, `test_bfcl_benchmark.js`, GVX nursery |
| 9 | Matrice démontré/partiellement/non-démontrable | 📋 **À produire** |

---

## Critère de Réussite Global (Item 6)

| Statut | Concepts concernés |
|--------|-------------------|
| Implémenté + testé périmètre précis | Organisme computationnel, immunité épistémique, leases, snapshots, fossilisation, reproduction computationnelle, orchestration bornée |
| Partiellement opérationnalisé limites explicites | Navigation web, contrôleur bureau, convergence multi-agents, benchmarks comparatifs |
| Démontré sous hypothèses déclarées | Causalité procédurale (Self-Twin), promotion épistémique (ADR 0021b), fiabilité cognitive bornée (ADR 0025) |
| Non démontrable, correctement encadré | Conscience, qualia, intentionnalité réelle, réalité indépendante, causalité réelle, vérité du succès modèle |
| Hors périmètre (sécurité/autorité/vérifiabilité) | Autonomie illimitée, auto-promotion, superviseur seul, autofix sans lease, réécriture historique silencieuse |

---

## Fichiers Clés par Lot

### Lot A (Épistémologie)
- `docs/adr/0016-effets-runtime-philosophiques-controles.md`
- `docs/adr/0017-philosophie-politique-et-gouvernance.md`
- `docs/adr/0019-socle-epistemique-du-savoir.md`
- `docs/adr/0027-adaptateurs-conscience-et-metaphysique.md`
- `crates/genos-orchestrator/src/conscience.rs`

### Lot B (Organismes)
- `crates/genos-orchestrator/src/organism.rs`
- `crates/genos-orchestrator/src/orchestrator.rs`
- `crates/genos-orchestrator/src/ecosystem.rs`
- `crates/genos-orchestrator/src/specialized_cell_runtime.rs`
- `crates/genos-immune/src/lib.rs`
- `crates/genos-reproduction/src/lib.rs`
- `crates/genos-biology/src/lib.rs`

### Lot C (Gouvernance)
- `crates/genos-orchestrator/src/kernel_governance.rs`
- `crates/genos-orchestrator/src/kernel_morphogenesis.rs`
- `crates/genos-orchestrator/src/kernel_morphogenesis_lease.rs`
- `crates/genos-orchestrator/src/token_bucket.rs`
- `crates/genos-orchestrator/src/trace.rs`
- `crates/genos-orchestrator/src/durable_receipts.rs`
- `mcp/lease.js`

### Lot D (Web/Bureau)
- `crates/genos-sensorimotor/src/lib.rs`
- `backend/src/services/foraging*.js`
- `backend/tests/test_web_journey_verifier.js`
- `backend/tests/test_foveal_vision.js`
- `backend/tests/test_browser_scout.js`

### Lot E (Réparation)
- `crates/genos-orchestrator/src/clinical_therapy.rs`
- `crates/genos-orchestrator/src/authorized_therapy.rs`
- `crates/genos-store/src/snapshot.rs`
- `crates/genos-store/src/fossil.rs`
- `crates/genos-store/src/continuation_wal.rs`
- `crates/genos-orchestrator/src/kernel_morphogenesis_lease.rs`

### Lot F (Composition)
- `crates/genos-signal/src/lib.rs`
- `crates/genos-orchestrator/src/ecosystem.rs`
- `crates/genos-orchestrator/src/orchestrator_tissues.rs`
- `backend/tests/test_rival_challenge.js`
- `backend/tests/test_bfcl_benchmark.js`
- `backend/tests/stress/*.js`

### Infrastructure Commune
- `crates/genos-store/src/event.rs`
- `crates/genos-store/src/continuation_wal.rs`
- `crates/genos-store/src/snapshot.rs`
- `crates/genos-store/src/cryptobiosis.rs`
- `crates/genos-store/src/fossil.rs`
- `crates/genos-store/src/biological_receipt.rs`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/security.js`
- `mcp/lease.js`
- `crates/genos-immune/src/cyber_immune.rs`