# GenOS Model Context Protocol (MCP) Tools Reference

The GenOS Model Context Protocol (MCP) server provides 65 structured primitives across 10 specialized functional families, enabling LLMs, autonomous agents, and IDE extensions to manage genomes, isolated capsules, counterfactual trajectories, collective intelligence, and living architectural memory over JSON-RPC 2.0. Source schemas are defined in [`crates/genos-protocol`](../../crates/genos-protocol).

---

## 1. Protocol Framing & Standard Envelopes

Every tool invocation returns a standardized `ProtocolResult` payload conforming to `genos.protocol/v1alpha1`:

```json
{
  "protocol_version": "genos.protocol/v1alpha1",
  "operation": "snapshot",
  "exit_code": 0,
  "output": {
    "snapshot_id": "snap_01H8X9",
    "world_cas": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "stdout": "Snapshot snap_01H8X9 committed to CAS.",
  "stderr": "",
  "is_tainted": true
}
```

---

## 2. Core Lifecycle & Capsule Family (10 Tools)

| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_create` | `name: str, role: str, out?: str` | `name, role` | Generates a new agent genome manifest. |
| `genos_snapshot` | `capsule_id: str, root?: str` | `capsule_id` | Checkpoints cognitive state and isolated workspace. |
| `genos_restore` | `capsule_id: str, root?: str` | `capsule_id` | Restores a capsule into a live isolated world. |
| `genos_fork` | `capsule_id: str, branches: Array<{label, hypothesis}>, root?: str` | `capsule_id, branches` | Forks sibling counterfactual worlds from checkpoint. |
| `genos_run` | `capsule_id: str, command: str, root?: str, allow_failure?: bool` | `capsule_id, command` | Executes a command in isolated workspace. |
| `genos_inspect` | `path: str` | `path` | Validates and inspects an agent genome. |
| `genos_diff` | `a: str, b: str, root?: str, store?: str` | `a, b` | Computes logical delta between snapshots/genomes. |
| `genos_lineage` | `snapshot?: str, root_snapshot?: str, root?: str` | - | Traverses snapshot ancestry DAG. |
| `genos_replay` | `snapshot?: str, branch_id?: str, root?: str` | - | Reconstructs state deterministically from event stream. |
| `genos_merge` | `manifest: str` | `manifest` | Merges counterfactual branch insights. |

---

## 3. Experiment & Causal Simulation Family (6 Tools)

| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_workspace_experiment` | `manifest?: str, repo?: str, plan?: str, root?: str` | - | Multi-world isolated workspace refactoring. |
| `genos_causal_replay_experiment` | `manifest: str, root?: str` | `manifest` | Replays historical decisions under perturbations. |
| `genos_incident_experiment` | `manifest?: str, snapshot?: str, evidence?: str, search_plan?: str, root?: str, summary?: bool` | - | Production incident root-cause discovery. |
| `genos_scientific_experiment` | `manifest?: str, dataset?: str, research_plan?: str, root?: str, summary?: bool` | - | Automated hypothesis falsification on datasets. |
| `genos_security_coevolution` | `manifest?: str, environment?: str, evolution_plan?: str, root?: str, summary?: bool` | - | Red/Blue team adversarial co-evolution. |
| `genos_bug_investigation` | `manifest?: str, repo?: str, plan?: str, root?: str, summary?: bool` | - | Parallel hypothesis bug isolation matrix. |

---

## 4. Reasoning & Trajectory Engineering Family (16 Tools)

| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_diagnose` | `problem: str, hypotheses: str[], root?: str` | `problem, hypotheses` | Formulates falsification-oriented hypothesis tree. |
| `genos_hypothesis_evidence` | `diagnosis_id: str, hypothesis_id: str, claim: str, source: str, confidence: num, artifact?: str, against?: bool, root?: str` | `diagnosis_id, hypothesis_id, claim, source, confidence` | Attaches verifiable test evidence to hypothesis. |
| `genos_solve` | `problem: str, strategies?: str[], branches?: int, minimal_patch?: bool, root?: str` | `problem` | Explores diverse isolated solution trajectories. |
| `genos_evaluate_trajectories` | `solve_id: str, scores: str[], keep?: int, root?: str` | `solve_id, scores` | Scores and ranks candidate trajectories. |
| `genos_record_decision` | `title: str, alternatives?: str[], evidence?: str[], assumptions?: str[], code_refs?: str[], test_refs?: str[], requirement_refs?: str[], expected?: str, observed?: str, parent_hypothesis?: str, root?: str` | `title` | Persists evidence-backed Living ADR. |
| `genos_blame` | `reference: str, root?: str` | `reference` | Traces code/tests back to decision rationales. |
| `genos_invalidate_assumption` | `assumption: str, observed: str, root?: str` | `assumption, observed` | Computes cascade impact of invalidated premises. |
| `genos_record_experience` | `strategy: str, context: str, outcome: str, successful: bool, evidence?: str[], source_branch?: str, root?: str` | `strategy, context, outcome, successful` | Stores positive/negative knowledge in global store. |
| `genos_search_failures` | `query: str, root?: str` | `query` | Semantic vector search across past failed attempts. |
| `genos_cherry_pick_experience`| `experience_id: str, to_branch: str` | All | Transfers verified insight between branches. |
| `genos_adversarial_review` | `target: str, critics?: str[], worlds?: str[], rounds?: int, blind?: bool, root?: str` | `target` | Orchestrates blind multi-persona code review. |
| `genos_future_ci` | `target: str, worlds: str[], agents?: str[], dependency?: str, migration_from?: str, migration_to?: str, root?: str` | `target, worlds` | Tests patch across future runtime versions. |
| `genos_repository_genome` | `architecture?: str[], conventions?: str[], invariants?: str[], security_rules?: str[], testing_policy?: str[], performance_requirements?: str[], domain_language?: str[], forbidden_patterns?: str[], root?: str` | - | Defines repository-wide architectural contracts. |
| `genos_bisect_agent` | `states: str[], dimension?: str` | `states` | Binary searches trajectory to find regression. |
| `genos_analyze_trajectory` | `steps: str[]` | `steps` | Detects cognitive loops and action churn. |
| `genos_compile_memory` | `facts?: str[], decisions?: str[], failures?: str[], constraints?: str[], open_questions?: str[], source_refs?: str[], root?: str` | - | Distills context into durable minimal memory. |

---

## 5. Resilience & Biological Defense Family (4 Tools)

| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_resilience_apoptosis` | `agent_id: str` | `agent_id` | Gracefully destroys errant capsule to preserve state integrity. |
| `genos_resilience_cryptobiosis` | `mode: str` | `mode` | Freezes active execution into offline Zstandard stasis. |
| `genos_resilience_hypermutation`| `target: str` | `target` | Fuzzes prompt and genome drives when exploration stalls. |
| `genos_resilience_circuit_breaker` | `branch_id: str` | `branch_id` | Halts runaway branch exceeding budget or error ceilings. |

---

## 6. Biomimicry & Collective Intelligence Family (13 Tools)

| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_biomimicry_swarm_consensus` | `target: str` | `target` | Gathers decentralized quorum consensus across agents. |
| `genos_biomimicry_flocking_explore` | `area: str` | `area` | Launches Boids-algorithm distributed exploration. |
| `genos_biomimicry_network_quorum` | `node: str` | `node` | Evaluates BFT quorum agreement across nodes. |
| `genos_biomimicry_distributed_huddle` | `state_file: str` | `state_file` | Synchronizes shared working memory across agents. |
| `genos_biomimicry_inject_pheromone` | `node: str, pheromone_type: str, amount: str` | All | Injects pheromones manually onto the spatial grid. |
| `genos_biomimicry_genetic_sos` | `agent_id: str, stress_level: str` | All | Triggers SOS response for high-stress agents. |
| `genos_biomimicry_alter_plasmid` | `plasmid_id: str, payload: str` | All | Alters plasmid for horizontal gene transfer. |
| `genos_biomimicry_observe_gradient` | `agent_id: str` | `agent_id` | Observes positional morphogenetic gradient of agent. |
| `genos_biomimicry_manipulate_gradient` | `agent_id: str, gradient_value: str` | All | Manipulates positional morphogenetic gradient. |
| `genos_biomimicry_brier_consensus` | `topic: str` | `topic` | Evaluates Brier score consensus for a huddle topic. |
| `genos_biomimicry_alter_huddle` | `topic: str, agent_id: str, payload: str` | All | Injects verified belief into distributed huddle. |
| `genos_biomimicry_cryptobiosis_force` | `agent_id: str` | `agent_id` | Forces agent into Zstandard cryptobiosis state. |
| `genos_biomimicry_ampk_alter` | `agent_id: str, atp: str, adp: str, amp: str` | All | Alters Atkinson energy charge for agent. |

---

## 7. Hallucination Mitigation Family (7 Tools)

| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_hallucination_detect` | - | - | Scans for missing execution receipts and ungrounded claims. |
| `genos_hallucination_inject` | - | - | Injects controlled false premises for red teaming. |
| `genos_hallucination_test` | - | - | Executes ImpossibleBench evaluation suite. |
| `genos_hallucination_extract` | - | - | Exports epistemic belief graphs to JSON format. |
| `genos_hallucination_analyze` | - | - | Evaluates trajectory semantic entropy. |
| `genos_hallucination_correct` | - | - | Corrects hallucinations via process supervision. |
| `genos_hallucination_simulate` | - | - | Simulates hallucination cascade in isolated world. |

---

## 8. Security Gateway, MCTS, Evolution & Synaptic Memory Families (9 Tools)

### Security Gateway Primitives (2 Tools)
| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_configure_gateway` | `threshold: int, cooldown_ms: int` | All | Configures Half-Open circuit breaker for Tool Gateway. |
| `genos_inject_crispr_spacer` | `spacer_signature: str` | `spacer_signature` | Injects adversarial spacer footprint to block payloads. |

### MCTS Trajectory Exploration (2 Tools)
| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_mcts_introspect` | `node_id: str` | `node_id` | Introspects state and visit statistics of MCTS node. |
| `genos_mcts_prune` | `node_id: str` | `node_id` | Force prunes a dominated node in the MCTS tree. |

### Evolution & Model Routing (2 Tools)
| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_evolution_assimilate_plasmid` | `plasmid_id: str` | `plasmid_id` | Forces assimilation of MCP plasmid via horizontal transfer. |
| `genos_evolution_set_entropy_threshold` | `threshold: num` | `threshold` | Sets entropy threshold for SLM vs Frontier routing. |

### Synaptic STDP & Memory Consolidation (3 Tools)
| Tool Name | Parameters | Required | Description |
|---|---|---|---|
| `genos_inspect_manifest` | `snapshot_id: str, component: str` | All | Inspects Copy-on-Write memory manifest component. |
| `genos_synaptic_stdp_update` | `pre_node_id: str, post_node_id: str, delta_t_ms: int` | All | Updates associative edge weights via STDP timing. |
| `genos_synaptic_prune_scale` | `prune_threshold: num, target_activity: num` | All | Executes homeostatic scaling and synaptic pruning. |

---

## 9. Error Handling, Taint Tracking & Circuit Breakers

When an operation fails inside an isolated world (e.g. compiler error, failed assertion), the MCP server returns a standard RPC response with structured execution failure details (`exit_code: 1`):

```json
{
  "jsonrpc": "2.0",
  "id": "req-102",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"protocol_version\":\"genos.protocol/v1alpha1\",\"operation\":\"run\",\"exit_code\":1,\"output\":null,\"stdout\":\"\",\"stderr\":\"error[E0432]: unresolved import `genos_core::Missing`\",\"is_tainted\":true}"
      }
    ],
    "structuredContent": {
      "protocol_version": "genos.protocol/v1alpha1",
      "operation": "run",
      "exit_code": 1,
      "output": null,
      "stdout": "",
      "stderr": "error[E0432]: unresolved import `genos_core::Missing`",
      "is_tainted": true
    },
    "isError": true
  }
}
```

### Safety Features:
1. **Taint Tracking**: All untrusted inputs and tool execution outputs are flagged with `is_tainted: true` until verified by an invariant check.
2. **Circuit Breakers**: Repeated failures trip the Half-Open circuit breaker, returning custom error code `-32004` to prevent runaway execution loops.

---

## 10. Dynamic Strategy Selection

### `genos_change_strategy`
**Description**: Re-evaluates the complete 77-strategy registry when evidence shows that the active strategy no longer matches the mission need.
**Parameters**:
- `need` *(string)*: Current concrete need or newly discovered problem.
- `reason` *(string)*: Evidence-backed reason for reconsidering the active strategy.
- `problem_profile` *(object)*: Optional risk, uncertainty, complexity, evaluability, reversibility, or problem-type overrides.
- `max_cost_level` *(integer)*: Optional maximum strategy cost from 1 to 5.
- `allow_experimental`, `allow_prototype`, `allow_experimental_at_high_risk` *(boolean)*: Explicit maturity-policy overrides.
**Usage**: Only the owning orchestrator receives this tool. GenOS scores all 77 strategies, retains the current contract when its portfolio is still the best fit, or creates a new immutable contract version when the need materially changes. The active execution run is superseded and the new run receives only the remaining tokens, cost, latency, and event budget. Existing workers finish under their inherited contract; workers dispatched afterward inherit the new one.

---

## 11. Swarm Orchestration

### `genos_a_team_preview`
**Description**: Provisions a bounded GenOS A-Team when a mission spans at least two distinct competency domains. The control plane can also compose it automatically from mission analysis.
**Parameters**:
- `project_goal` *(string)*: Detailed description of the final objective.
- `sub_systems` *(array of 2–3 strings)*: Distinct, bounded competency domains.
- `assigned_roles` *(array of strings)*: Specialist roles aligned with the subsystems.
- `model_tiers` *(array of strings)*: Optional model tiers aligned with the subsystems.
- `enforce_genos_rules` *(boolean)*: Retained for compatibility; isolation, evidence, budgets, and leases are always enforced.
**Usage**: The orchestrator receives the tool only through its lease. Each member occupies one of the three garage slots, inherits the root mission's execution policy, works in an isolated capsule, and returns evidence to the orchestrator. Workers cannot compose another A-Team.

### `genos_trinity_launch`
**Description**: Launches three isolated comparison worlds: the raw need, an implementation based on the user-interview plan, and an independently AI-corrected implementation.
**Parameters**:
- `mission` *(string)*: Concrete shared mission, including requirements learned during the interview.
- `rationale` *(string)*: Optional explanation of why three comparative worlds are useful.
- `execution_budget` *(object)*: Optional bounded budget inherited by each world.
**Usage**: An explicit request for “Trinity” activates it when the three garage slots and token budget are available. A request such as “interview me to create a plan” creates a Trinity decision gate instead: the orchestrator conducts the interview first, then launches Trinity only if the resulting mission benefits from three comparative implementations. A-Team and Trinity cannot occupy the garage simultaneously, and workers cannot launch Trinity recursively.
