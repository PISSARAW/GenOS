# Phase 1: Gap Register — Capability → Implementation → Test → Proof

**Generated:** 2026-10-05  
**Source:** `backend/src/services/topologyCapabilityService.js` (52 capabilities) + codebase audit

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Declared in topologyCapabilityService | 52 | — |
| **Node: Used in production code** | 27 | PARTIAL |
| **Node: Zero production usage** | 25 | **MISSING** |
| **Rust: Implemented (keyword evidence)** | ~15 | PARTIAL |
| **Rust: Zero keyword evidence** | ~37 | **MISSING** |

> **Critical finding:** 25/52 capabilities (48%) have **zero production usage** in Node backend. The capability contract is almost entirely declarative.

---

## Capability Matrix

| Capability | Node Usage | Rust Keywords | Lease Tools | Test Coverage | Criticality | Gap Classification |
|------------|------------|---------------|-------------|---------------|-------------|---------------------|
| **PROVENANCE** | 379 | 23 | — | `test_provenance_*` | HIGH | ✅ Wired (observability) |
| **QUORUM** | 114 | 61 | `genos_evaluate_trajectories`, `genos_execute_primitive` | `test_quorum_*` | HIGH | ✅ Wired (consensus) |
| **EVIDENCE_BARRIER** | 27 | 44 | — | `test_evidence_barrier_*` | HIGH | ✅ Wired (gates) |
| **OBSERVABILITY** | 30 | 36 | `genos_report_progress`, `genos_organization_state` | `test_telemetry_*` | HIGH | ✅ Wired (telemetry) |
| **COMPLIANCE** | 29 | 0 | — | `test_compliance_*` | HIGH | ⚠️ Node-only, no Rust |
| **STRATEGY_PORTFOLIO** | 15 | 104 | `genos_change_strategy` | `test_strategy_*` | HIGH | ✅ Wired (strategy) |
| **MODEL_ROUTING** | 13 | 1 | — | `test_model_routing_*` | HIGH | ⚠️ Partial Rust |
| **STIGMERGY** | 12 | 22 | `genos_worker_publish`, `genos_topology_session`, `genos_execute_primitive` | `test_stigmergy_*` | HIGH | ✅ Wired (swarm) |
| **IMMUNE_SYSTEM** | 6 | 50 | `genos_security_coevolution`, `genos_parasitic_pressure`, `genos_execute_primitive` | `test_immune_*` | HIGH | ⚠️ Rust-only impl |
| **COMPUTER_USE** | 5 | 0 | `genos_computer_use` | `test_computer_use_*` | HIGH | ⚠️ Node-only, no Rust |
| **HALLUCINATION_MONITORING** | 5 | 0 | — | `test_hallucination_*` | HIGH | ⚠️ Node-only, no Rust |
| **TOKEN_ECONOMY** | 0 | 91 | `genos_report_progress`, `genos_execute_primitive` | — | HIGH | **MISSING** (declared only) |
| **GRAPH_MEMORY** | 0 | 10 | `genos_compile_memory`, `genos_search_failures` | — | HIGH | **MISSING** (declared only) |
| **EPISODIC_MEMORY** | 1 | 0 | `genos_record_experience`, `genos_cherry_pick_experience` | — | HIGH | **MISSING** (declared only) |
| **PROCEDURAL_MEMORY** | 0 | 4 | `genos_record_experience`, `genos_cherry_pick_experience` | — | HIGH | **MISSING** (declared only) |
| **CRDT_SHARED_STATE** | 2 | 0 | `genos_worker_publish`, `genos_worker_inbox`, `genos_topology_session` | — | HIGH | **MISSING** (declared only) |
| **SIGNALING_BUS** | 2 | 18 | `genos_worker_publish`, `genos_worker_inbox`, `genos_topology_session` | — | HIGH | **MISSING** (declared only) |
| **SYNAPTIC_PLASTICITY** | 2 | 13 | `genos_record_experience` | — | HIGH | **MISSING** (declared only) |
| **CAUSAL_STATE** | 2 | 25 | `genos_causal_replay_experiment`, `genos_topology_session` | — | HIGH | **MISSING** (declared only) |
| **INVARIANT_GATES** | 2 | 3 | `genos_guardrails_verify`, `genos_topology_session` | — | HIGH | **MISSING** (declared only) |
| **TRANSACTIONAL_SHARED_STATE** | 2 | 0 | — | — | HIGH | **MISSING** (declared only) |
| **SELECTIVE_SYNC** | 2 | 15 | — | — | HIGH | **MISSING** (declared only) |
| **RESILIENCE_RECOVERY** | 0 | 17 | `genos_resilience_hypermutation` | — | HIGH | **MISSING** (declared only) |
| **CONSCIENCE_HOMEOSTASIS** | 0 | 37 | — | — | HIGH | **MISSING** (declared only) |
| **EVOLUTION_REPRODUCTION** | 0 | 51 | `genos_resilience_hypermutation` | — | HIGH | **MISSING** (declared only) |
| **GENOME_EPIGENETICS** | 0 | 246 | `genos_repository_genome` | — | HIGH | **MISSING** (declared only) |
| **LIGAND_RECEPTOR** | 0 | 22+11 | `genos_worker_publish`, `genos_worker_inbox`, `genos_topology_session` | — | HIGH | **MISSING** (declared only) |
| **SWARM_METRICS** | 0 | 0 | — | — | HIGH | **MISSING** (declared only) |
| **PROMOTION_GATE** | 0 | 0 | `genos_record_decision`, `genos_evaluate_trajectories` | — | HIGH | **MISSING** (declared only) |
| **OUTPUT_GOVERNOR** | 0 | 0 | `genos_guardrails_verify` | — | HIGH | **MISSING** (declared only) |
| **VFS_SANDBOX** | 0 | 1 | `genos_run` | — | HIGH | **MISSING** (declared only) |
| **CAPSULES_SNAPSHOTS** | 0 | 60 | `genos_snapshot`, `genos_fork` | — | HIGH | **MISSING** (declared only) |
| **CHAOS_ENGINEERING** | 0 | 0 | — | — | HIGH | **MISSING** (declared only) |
| **INFERENCE_GATEWAY** | 0 | 0 | — | — | HIGH | **MISSING** (declared only) |
| **LOCAL_INFERENCE** | 1 | 0 | — | — | HIGH | **MISSING** (declared only) |
| **PROCEDURAL_GUIDANCE** | 0 | 0 | `genos_execute_strategy_pipeline` | — | HIGH | **MISSING** (declared only) |
| **PROCEDURAL_EVOLUTION** | 0 | 4 | `genos_resilience_hypermutation`, `genos_repository_genome` | — | HIGH | **MISSING** (declared only) |
| **PROCEDURAL_CAUSAL_VALIDATION** | 0 | 0 | `genos_causal_replay_experiment`, `genos_workspace_experiment` | — | HIGH | **MISSING** (declared only) |
| **SEMANTIC_CONFLICTS** | 2 | 18 | `genos_adversarial_review`, `genos_topology_session` | — | HIGH | **MISSING** (declared only) |
| **ARENA_COMPETITION** | 0 | 10 | `genos_adversarial_review`, `genos_evaluate_trajectories` | — | HIGH | **MISSING** (declared only) |
| **STRATEGY_ADAPTATION** | 2 | 1 | `genos_change_strategy` | — | HIGH | **MISSING** (declared only) |
| **EPISTEMICS_BRIER** | 0 | 4 | — | — | HIGH | **MISSING** (declared only) |
| **HALLUCINATION_MONITORING** | 5 | 0 | — | — | HIGH | **MISSING** (declared only) |
| **FOVEAL_PERCEPTION** | 0 | 0 | `genos_foveal_crop` | — | HIGH | **MISSING** (declared only) |
| **WEB_FORAGING** | 1 | 0 | `genos_browser_act`, `genos_optimal_foraging` | — | HIGH | **MISSING** (declared only) |
| **VECTOR_MEMORY** | 0 | 5 | `genos_compile_memory` | — | HIGH | **MISSING** (declared only) |
| **GOVERNANCE_APPROVAL** | 0 | 60 | `genos_record_decision` | — | HIGH | **MISSING** (declared only) |

---

## Topology Capability Coverage

| Topology | Declared Capabilities | Node Implemented | Rust Implemented | Gap |
|----------|----------------------|------------------|------------------|-----|
| **trinity** | 10 | ~5 | ~3 | 50% |
| **a_team** | 9 | ~4 | ~2 | 55% |
| **biome** | 8 | ~2 | ~3 | 75% |
| **biocenose** | 7 | ~3 | ~2 | 57% |
| **holobionte** | 12 | ~1 | ~4 | 92% |
| **syncytium** | 10 | ~2 | ~3 | 80% |
| **rhizome** | 6 | ~2 | ~2 | 67% |
| **metapopulation** | 6 | ~1 | ~2 | 83% |

---

## Organization Capability Coverage

| Organization | Declared Capabilities | Node Implemented | Rust Implemented | Gap |
|--------------|----------------------|------------------|------------------|-----|
| specialist_expert_committee | 4 | ~2 | ~1 | 50% |
| blind_adversarial_review | 4 | ~1 | ~1 | 75% |
| red_blue_coevolution | 4 | ~1 | ~1 | 75% |
| brier_weighted_consensus | 3 | ~0 | ~1 | 100% |
| quorum_with_abstention | 3 | ~1 | ~1 | 67% |
| stigmergy | 3 | ~2 | ~2 | 33% |
| flocking_boids | 2 | ~0 | ~0 | 100% |
| fish_school_search | 2 | ~0 | ~0 | 100% |
| slime_mould_network | 3 | ~1 | ~1 | 67% |
| grey_wolf_optimizer | 2 | ~0 | ~0 | 100% |
| mycelial_routing | 3 | ~0 | ~1 | 100% |
| dynamic_polyethism | 2 | ~0 | ~0 | 100% |
| energy_huddle | 2 | ~0 | ~0 | 100% |
| network_silence | 2 | ~0 | ~0 | 100% |
| strategy_arena | 3 | ~0 | ~0 | 100% |
| hierarchical_merge | 3 | ~1 | ~1 | 67% |
| competitive_arena | 2 | ~0 | ~0 | 100% |
| isolated_recovery | 3 | ~0 | ~1 | 100% |
| memory_compilation | 3 | ~1 | ~1 | 67% |

---

## Critical Gaps (Priority Order)

### 🔴 CRITICAL — Core Runtime Capabilities (Blockers for Phase 2)

| Capability | Why Critical | Node Status | Rust Status | Action Required |
|------------|--------------|-------------|-------------|-----------------|
| **TOKEN_ECONOMY** | Budget enforcement for all topologies | Declared only | Keywords present (91) | Implement budget tracking + lease consumption |
| **GRAPH_MEMORY** | Core memory for trinity/a_team | Declared only | Keywords present (10) | Connect `genos_compile_memory` to capability |
| **EPISODIC_MEMORY** | Required for biome/holobionte/metapopulation | 1 usage | None | Wire `genos_record_experience` |
| **CRDT_SHARED_STATE** | Required for syncytium | 2 usages | None | Implement CRDT sync in Rust |
| **SIGNALING_BUS** | Required for 6 topologies | 2 usages | Keywords present (18) | Full Rust implementation |
| **SYNAPTIC_PLASTICITY** | Required for metapopulation | 2 usages | Keywords present (13) | Connect STDP to capability |
| **CAUSAL_STATE** | Required for syncytium | 2 usages | Keywords present (25) | Wire causal replay |
| **INVARIANT_GATES** | Required for syncytium | 2 usages | Keywords present (3) | Implement invariant checking |
| **RESILIENCE_RECOVERY** | Required for biome/holobionte/syncytium | 0 | Keywords present (17) | Connect cryptobiosis/snapshots |
| **CONSCIENCE_HOMEOSTASIS** | Required for holobionte | 0 | Keywords present (37) | Implement cognitive regulation loop |
| **EVOLUTION_REPRODUCTION** | Required for holobionte/metapopulation | 0 | Keywords present (51) | Connect reproduction cycle |
| **GENOME_EPIGENETICS** | Required for holobionte/metapopulation | 0 | Keywords present (246) | Connect genome operations |
| **CAPSULES_SNAPSHOTS** | Required for syncytium/holobionte | 0 | Keywords present (60) | Connect snapshot/capsule ops |

### 🟠 HIGH — Web Sensorium & Perception (Blockers for Phase 3)

| Capability | Why Critical | Node Status | Rust Status | Action Required |
|------------|--------------|-------------|-------------|-----------------|
| **WEB_FORAGING** | Core browser loop | 1 usage | None | Connect browser_act → foraging → verify |
| **FOVEAL_PERCEPTION** | Required for biome | 0 | None | Connect foveal_crop → sensorium |
| **COMPUTER_USE** | Desktop control | 5 usages | None | Connect computer_use → sensorium |

### 🟡 MEDIUM — Swarm & Coordination (Phase 4)

| Capability | Why Critical | Node Status | Rust Status | Action Required |
|------------|--------------|-------------|-------------|-----------------|
| **SWARM_METRICS** | Required for biome/biocenose/metapopulation | 0 | None | Implement swarm metrics collection |
| **LIGAND_RECEPTOR** | Required for a_team/rhizome/holobionte | 0 | Keywords present (33) | Implement receptor routing |
| **STRATEGY_ADAPTATION** | Required for rhizome | 2 usages | 1 keyword | Connect strategy switching |
| **PROMOTION_GATE** | Required for trinity/biocenose/holobionte | 0 | None | Implement promotion gates |
| **OUTPUT_GOVERNOR** | Required for syncytium | 0 | None | Implement output governance |

### 🟢 LOW — Advanced / Experimental (Phase 6+)

| Capability | Why Critical | Node Status | Rust Status | Action Required |
|------------|--------------|-------------|-------------|-----------------|
| **CHAOS_ENGINEERING** | Required for isolated_recovery | 0 | None | Implement chaos experiments |
| **TRANSACTIONAL_SHARED_STATE** | Required for syncytium | 2 usages | None | Implement transactional state |
| **SELECTIVE_SYNC** | Required for syncytium | 2 usages | Keywords present (15) | Implement selective CRDT sync |
| **INFERENCE_GATEWAY** | Required for holobionte/syncytium | 0 | None | Implement unified inference |
| **LOCAL_INFERENCE** | Required for holobionte/syncytium | 1 usage | None | Connect local model execution |
| **MODEL_ROUTING** | Required for syncytium/holobionte | 13 usages | 1 keyword | Complete routing logic |
| **VFS_SANDBOX** | Required for syncytium | 0 | 1 keyword | Implement VFS isolation |
| **ARENA_COMPETITION** | Required for trinity/a_team/biocenose | 0 | 10 keywords | Connect adversarial review |
| **EPISTEMICS_BRIER** | Required for trinity/biocenose/metapopulation | 0 | 4 keywords | Implement Brier scoring |

---

## Unused Capabilities in topologyCapabilityService

### Never Referenced in Production Code (25 capabilities)

These capabilities are **declared but never called** in any production code path:

1. `TOKEN_ECONOMY` — Budget enforcement
2. `GRAPH_MEMORY` — Multi-modal memory
3. `EPISODIC_MEMORY` — Episode storage
4. `PROCEDURAL_MEMORY` — Procedure storage
5. `CRDT_SHARED_STATE` — CRDT sync
6. `SIGNALING_BUS` — Inter-agent signals
7. `SYNAPTIC_PLASTICITY` — STDP learning
8. `CAUSAL_STATE` — Causal tracking
9. `INVARIANT_GATES` — Invariant enforcement
10. `TRANSACTIONAL_SHARED_STATE` — Transactional state
11. `SELECTIVE_SYNC` — Selective CRDT sync
12. `RESILIENCE_RECOVERY` — Recovery from failure
13. `CONSCIENCE_HOMEOSTASIS` — Cognitive regulation
14. `EVOLUTION_REPRODUCTION` — Genome evolution
15. `GENOME_EPIGENETICS` — Epigenetic state
16. `LIGAND_RECEPTOR` — Capability mesh routing
17. `SWARM_METRICS` — Swarm observability
18. `PROMOTION_GATE` — Evidence promotion
19. `OUTPUT_GOVERNOR` — Output control
20. `VFS_SANDBOX` — Filesystem isolation
21. `CAPSULES_SNAPSHOTS` — Snapshot capsules
22. `CHAOS_ENGINEERING` — Chaos experiments
23. `INFERENCE_GATEWAY` — Unified inference
24. `LOCAL_INFERENCE` — On-device inference
25. `PROCEDURAL_GUIDANCE` — Strategy pipeline
26. `PROCEDURAL_EVOLUTION` — Procedure evolution
27. `PROCEDURAL_CAUSAL_VALIDATION` — Causal validation
28. `SEMANTIC_CONFLICTS` — Semantic conflict detection
29. `ARENA_COMPETITION` — Adversarial arena
30. `STRATEGY_ADAPTATION` — Strategy switching
31. `EPISTEMICS_BRIER` — Brier scoring
32. `HALLUCINATION_MONITORING` — Hallucination detection
33. `FOVEAL_PERCEPTION` — Foveal vision
34. `WEB_FORAGING` — Web foraging
35. `VECTOR_MEMORY` — Vector memory
36. `GOVERNANCE_APPROVAL` — Governance approval

> **Note:** Some appear in `toolLeasePolicy.js` with tool mappings but those tools are never invoked in production flows.

---

## Test Coverage Gaps

| Capability | Node Tests | Rust Tests | Contract Test |
|------------|------------|------------|---------------|
| PROVENANCE | ✅ | ✅ | ❌ |
| QUORUM | ✅ | ✅ | ❌ |
| EVIDENCE_BARRIER | ✅ | ✅ | ❌ |
| OBSERVABILITY | ✅ | ✅ | ❌ |
| TOKEN_ECONOMY | ❌ | ❌ | ❌ |
| GRAPH_MEMORY | ❌ | ❌ | ❌ |
| CRDT_SHARED_STATE | ❌ | ❌ | ❌ |
| SIGNALING_BUS | ❌ | ❌ | ❌ |
| RESILIENCE_RECOVERY | ❌ | ❌ | ❌ |
| CONSCIENCE_HOMEOSTASIS | ❌ | ❌ | ❌ |
| EVOLUTION_REPRODUCTION | ❌ | ❌ | ❌ |
| GENOME_EPIGENETICS | ❌ | ❌ | ❌ |
| WEB_FORAGING | ✅ (partial) | ❌ | ❌ |
| FOVEAL_PERCEPTION | ❌ | ❌ | ❌ |
| COMPUTER_USE | ✅ (partial) | ❌ | ❌ |

---

## Recommendation: Phase 1 Completion Criteria

**Phase 1 is complete when:**

1. ✅ All 52 capabilities have at least one production code reference in Node OR Rust
2. ✅ Top 15 critical capabilities have contract tests (Rust ↔ Node parity)
3. ✅ Gap register classified and prioritized (this document)
4. ✅ Matrix `capability → implementation → test → proof` documented

**Estimated effort to close critical gaps:** 8-12 weeks for top 15 capabilities.

---

## Next Steps

1. **Phase 2:** Build minimal vertical slice using only capabilities with existing implementations (PROVENANCE, QUORUM, EVIDENCE_BARRIER, OBSERVABILITY, STRATEGY_PORTFOLIO)
2. **Phase 5 (parallel):** Define Rust-Node common execution contract for capabilities requiring both runtimes
3. **Phase 3:** Wire WEB_FORAGING → FOVEAL_PERCEPTION → COMPUTER_USE sensorium loop