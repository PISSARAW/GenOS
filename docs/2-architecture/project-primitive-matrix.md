# GenOS Project & Primitive Integration Matrix

GenOS establishes a unified, canonical 10-primitive vocabulary across CLI invocations, Model Context Protocol (MCP) server endpoints, JSON-RPC protocol methods, and Rust crate APIs. Every high-level project experiment is compiled down into an auditable trace composed exclusively of these foundational operations.

---

## 1. Canonical Primitive Cross-Reference Matrix

| Primitive | CLI Command | MCP Tool Name | JSON-RPC Method | Rust Crate API | Core Responsibilities |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`init`** | `genos agent init` | `genos_create` | `agent.init` | `genos_cli::cmd_init` | Workspace initialization, CAS storage hierarchy setup (`.genos/`). |
| **`snapshot`** | `genos agent snapshot <CAP_ID>` | `genos_snapshot` | `capsule.snapshot` | `genos_runtime::capsules::checkpoint_capsule` | Atomic freeze of `(Genome, State, World, EventCursor)` into content-addressed snapshot. |
| **`restore`** | `genos agent restore <CAP_ID>` | `genos_restore` | `capsule.restore` | `genos_runtime::capsules::resume_capsule` | Reconstitute an execution capsule to the exact historical snapshot state. |
| **`fork`** | `genos agent fork <CAP_ID> -b B1` | `genos_fork` | `capsule.fork` | `genos_core::fork_snapshot`, `WorldProvider::fork` | Generate independent counterfactual branch with isolated world and correlation id. |
| **`mutate`** | `genos agent mutate <GENOME> -d k=v` | `genos_inspect` | `genome.mutate` | `genos_core::mutate_cognition` | Create child genome with modified cognitive drives and lineage provenance. |
| **`run`** | `genos agent run <CAP_ID> -c CMD` | `genos_run` | `capsule.run` | `genos_runtime::AgentRuntime::step` | Execute bounded step or command, decrementing budget and emitting events. |
| **`diff`** | `genos agent diff <SNAP_A> <SNAP_B>` | `genos_diff` | `capsule.diff` | `genos_core::diff_snapshots`, `WorldProvider::diff` | Compute structural and semantic delta between states, memories, and filesystems. |
| **`merge`** | `genos agent merge <MANIFEST>` | `genos_merge` | `capsule.merge` | `genos_runtime::cognitive_merge::cognitive_merge` | Synthesize multi-branch learnings, resolve belief contradictions, unify state DAGs. |
| **`lineage`** | `genos agent lineage -s <SNAP_ID>` | `genos_lineage` | `lineage.inspect` | `genos_core::lineage::build_lineage_dag` | Traverse and render the DAG of ancestor genomes, snapshots, and mutation records. |
| **`replay`** | `genos agent replay -s <SNAP_ID>` | `genos_replay` | `event.replay` | `genos_store::replay_basic_state`, `CausalReplay` | Pure deterministic re-execution of historical event streams without side effects. |

---

## 2. Project Orchestrator Primitive Lifecycles

Every GenOS project experiment executes a specific canonical sequence of primitives. No project synthesizes synthetic state out of thin air; every step is auditable in `primitive_trace`.

```text
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   Project Primitive Execution Lifecycles                    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Project Archetype        â”‚ Canonical Primitive Execution Sequence           â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Calculator Counterfactualâ”‚ init â”€â”€â–º snapshot â”€â”€â–º fork â”€â”€â–º run â”€â”€â–º diff      â”‚
â”‚                          â”‚      â”€â”€â–º merge â”€â”€â–º lineage                       â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Extreme Refactor         â”‚ init â”€â”€â–º snapshot â”€â”€â–º recursive fork â”€â”€â–º run     â”‚
â”‚                          â”‚      â”€â”€â–º diff â”€â”€â–º merge â”€â”€â–º lineage              â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Temporal Causal Sim      â”‚ snapshot â”€â”€â–º restore â”€â”€â–º fork â”€â”€â–º replay         â”‚
â”‚                          â”‚          â”€â”€â–º diff â”€â”€â–º lineage                    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Adaptive Incident Search â”‚ snapshot â”€â”€â–º fork â”€â”€â–º mutate â”€â”€â–º replay â”€â”€â–º run  â”‚
â”‚                          â”‚          â”€â”€â–º recursive fork â”€â”€â–º lineage          â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Scientific Research      â”‚ snapshot â”€â”€â–º fork â”€â”€â–º run â”€â”€â–º replay â”€â”€â–º restore â”‚
â”‚                          â”‚          â”€â”€â–º merge â”€â”€â–º lineage                   â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Security Coevolution     â”‚ snapshot â”€â”€â–º fork â”€â”€â–º mutate â”€â”€â–º run â”€â”€â–º diff    â”‚
â”‚                          â”‚          â”€â”€â–º lineage                             â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Unknown-Cause Bug        â”‚ init â”€â”€â–º snapshot â”€â”€â–º fork â”€â”€â–º run â”€â”€â–º diff      â”‚
â”‚                          â”‚      â”€â”€â–º lineage (cognitive merge deferred)      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 3. High-Level Orchestrator Inputs & Modes

GenOS orchestrators support two mutually exclusive invocation modes: **Manifest Mode** (structured declarative file) and **Direct Input Mode** (CLI parameter flags).

```text
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚               Manifest Mode vs Direct Input Mode Mapping               â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Project Orchestrator    â”‚ Direct Input Mode CLI Flags                  â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Workspace Refactor      â”‚ `genos experiment workspace --repo PATH      â”‚
â”‚                         â”‚     --plan PATH`                             â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Incident Search         â”‚ `genos experiment incident --snapshot REF    â”‚
â”‚                         â”‚     --evidence PATH --search-plan PATH`      â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Scientific Research     â”‚ `genos experiment scientific --dataset PATH  â”‚
â”‚                         â”‚     --research-plan PATH`                    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Security Coevolution    â”‚ `genos experiment security-coevolution       â”‚
â”‚                         â”‚     --environment PATH --evolution-plan PATH`â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Bug Investigation       â”‚ `genos experiment bug-investigation          â”‚
â”‚                         â”‚     --repo PATH --plan PATH`                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Invariants:
1. **Mutual Exclusivity**: Passing both `--manifest` and direct input flags (`--repo`, `--plan`) produces an immediate validation error.
2. **Atomic Ingestion**: CLI flags are mapped directly to corresponding manifest AST nodes before being passed into the type-safe `genos-runtime` orchestration engine.

## 3.1 Agent authority and strategy registry

Every deployed agent has one explicit execution mode:

| Mode | Authority |
| --- | --- |
| `orchestrator` | Selects a strategy contract, owns planning, dispatches workers, evaluates evidence, and promotes a result. |
| `worker` | Is bound to one parent orchestrator and remains idle until that orchestrator dispatches a mission. It cannot start itself or select its own contract. |

`POST /api/deploy` defaults to `executionMode: "orchestrator"`. A worker requires
`executionMode: "worker"` and `parentAgentId` referencing an orchestrator. Dispatch
is explicit through `POST /api/agents/:id/workers/:workerId/dispatch`; direct worker
startup returns `WORKER_REQUIRES_ORCHESTRATOR`.

An orchestrator contract evaluates the complete 77-strategy registry before choosing
a constrained portfolio. The immutable contract stores all 77 selection decisions,
while `/api/strategies` exposes the complete catalogue. Only the chosen portfolio is
sent to a model runtime, so the registry remains available without consuming context
on irrelevant strategies. When `genos` and `genos-mcp` binaries are present, the
orchestrator runtime attaches the GenOS MCP server automatically; workers inherit
that evidence surface only after an explicit dispatch.

---

## 4. Primitive Trace Audit Structure

Every completed project execution writes a structured report containing an immutable `primitive_trace` record.

```json
{
  "project_id": "exp_workspace_refactor_8f91a",
  "orchestrator": "workspace_refactor",
  "status": "completed",
  "total_budget_spent": 42,
  "primitive_trace": [
    { "step": 1, "primitive": "init", "status": "success", "duration_ms": 12 },
    { "step": 2, "primitive": "snapshot", "target_id": "snap_01HGB7", "status": "success" },
    { "step": 3, "primitive": "fork", "parent_id": "snap_01HGB7", "branch_id": "branch_alpha", "status": "success" },
    { "step": 4, "primitive": "fork", "parent_id": "snap_01HGB7", "branch_id": "branch_beta", "status": "success" },
    { "step": 5, "primitive": "run", "branch_id": "branch_alpha", "command": "cargo check", "exit_code": 0 },
    { "step": 6, "primitive": "run", "branch_id": "branch_beta", "command": "cargo check", "exit_code": 0 },
    { "step": 7, "primitive": "diff", "branch_a": "branch_alpha", "branch_b": "branch_beta", "divergence_score": 0.12 },
    { "step": 8, "primitive": "merge", "manifest": "merge_plan_01HGB8.json", "winner": "branch_alpha" },
    { "step": 9, "primitive": "lineage", "root_snapshot": "snap_01HGB7", "leaf_snapshot": "snap_01HGB9" }
  ]
}
```

This trace guarantees that autonomous multi-agent systems remain 100% auditable, replayable, and forensic-ready under all circumstances.

