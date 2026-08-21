# GenOS CLI Reference Manual

The `genos` command-line interface provides operators, AI agents, and CI pipelines direct access to agent genomes, isolated world capsules, state snapshots, event-sourced lineage replay, developer trajectory analysis, and counterfactual experiments.

---

## 1. Global Conventions & Runtime Flags

### Exit Codes
- `0`: Success / Assertion or expectation satisfied.
- `1`: Domain validation error or runtime execution failure inside capsule.
- `2`: CLI argument parsing error (invalid flags or missing required values).
- `10`: State or expectation mismatch (e.g. `--expect-empty` failed on non-empty diff).

### Global Environment Variables
- `GENOS_ROOT`: Path to `.genos` repository metadata store (default: `./.genos`).
- `GENOS_BIN`: Path to the compiled `genos` executable.
- `GENOS_WORKSPACE_ROOT`: Base working directory for isolated world workspaces.

### Output Formatting
All subcommands support `--format json|yaml|text` (default varies by subcommand, typically `json` for programmatic tools and `yaml` for agent genomes).

---

## 2. Core Agent Primitives

### `genos init`
Initializes a new `.genos` state store and CAS repository in the current workspace.
```bash
genos init [--root <PATH>]
```
**JSON Output**:
```json
{
  "status": "initialized",
  "root": ".genos",
  "schema_version": "1.0.0"
}
```

### `genos agent create`
Generates a new provider-neutral agent genome manifest.
```bash
genos agent create --name <NAME> --role <ROLE> [--out <PATH>] [--format yaml|json]
```
- `--name`: Stable identifier for the agent genome.
- `--role`: Behavioral template and cognitive role (e.g., `refactoring-engineer`).
- `--out`: Target output file path (defaults to stdout).

### `genos agent inspect`
Validates schema correctness and inspects genes, traits, and cognitive constraints.
```bash
genos agent inspect <PATH> [--format yaml|json]
```
**Terminal Example**:
```bash
genos agent inspect genomes/refactor.yaml --format json
```
**JSON Output**:
```json
{
  "name": "refactor-bot",
  "role": "refactoring-engineer",
  "drives": {"curiosity": 0.8, "caution": 0.9},
  "invariants": ["Max 400 lines per file", "Max 3 params per function"]
}
```

### `genos agent mutate`
Applies stochastic or directed parameter modifications to an agent genome.
```bash
genos agent mutate <PATH> [--drive <KEY=VAL>]... [--out <PATH>]
```
**Example**:
```bash
genos agent mutate genomes/refactor.yaml --drive caution=0.95 --out genomes/careful.yaml
```

### `genos agent breed`
Combines traits from two parent agent genomes based on measured phenotype evidence.
```bash
genos agent breed <ALICE> <BOB> --evidence <PATH> --out <PATH>
```

### `genos agent infer-traits` & `promote-trait`
Infers emergent traits from phenotype execution logs and promotes them to canonical genome definitions.
```bash
genos agent infer-traits <GENOME> --phenotype <LOG>... --trait <NAME>... --out <PATH>
genos agent promote-trait <GENOME> --trait <NAME> --field <FIELD> --out <PATH>
```

### `genos agent run`
Executes a command inside the capsule's isolated filesystem world. Consumes budget and records events.
```bash
genos agent run <CAPSULE_ID> --command "<CMD>" [--allow-failure] [--root <PATH>]
```
**Example**:
```bash
genos agent run caps_worker_01 --command "cargo test -p genos-core"
```
**JSON Output**:
```json
{
  "protocol_version": "genos.protocol/v1alpha1",
  "operation": "run",
  "exit_code": 0,
  "output": {"passed": 42, "failed": 0},
  "stdout": "test result: ok. 42 passed; 0 failed",
  "stderr": ""
}
```

### `genos agent diff` / `genos diff`
Computes the logical state delta between two snapshots or genome files.
```bash
genos diff <a> <b> [--expect-empty] [--expect-changed-path <PATH>] [--format json|yaml|text]
```
**Example**:
```bash
genos diff snap_parent snap_branch_1 --format json
```

### `genos agent merge`
Reconciles branch experiences and cognitive insights using the Cognitive Merge Engine.
```bash
genos agent merge <MANIFEST_PATH>
```

### `genos agent lineage` & `replay`
Inspects DAG ancestry or deterministically reconstructs state from the event stream.
```bash
genos agent lineage [--snapshot <ID>] [--root <PATH>]
genos agent replay [--snapshot <ID>] [--branch-id <ID>]
```

### `genos agent fork-from-snapshot`
Derives sibling counterfactual forks directly from an existing snapshot without model calls.
```bash
genos agent fork-from-snapshot --snapshot <ID> [--count 2] [--save] [--emit-events]
```

---

## 3. Snapshot & State Management (`genos snapshot`)

Direct inspection, checkpointing, and manipulation of event-sourced snapshots.

```bash
# Checkpoint and retrieval
genos snapshot save --capsule <ID> --out <PATH>
genos snapshot get <SNAPSHOT_ID>
genos snapshot list [--root <PATH>]

# State introspection & mutation
genos snapshot set-var <SNAPSHOT_ID> --key <KEY> --value <JSON_VALUE>
genos snapshot check-var <SNAPSHOT_ID> --key <KEY>
genos snapshot add-memory <SNAPSHOT_ID> --kind semantic|episodic --content "<TEXT>"
genos snapshot set-belief <SNAPSHOT_ID> --key <KEY> --probability <FLOAT>
genos snapshot record-tool-call <SNAPSHOT_ID> --tool <NAME> --input <JSON> --output <JSON>
```

---

## 4. World Workspace Commands (`genos world`)

Manages isolated directory and Git worktree execution sandboxes.

```bash
# Create an isolated world sandbox
genos world create --provider git-worktree --repo-root . --name world-alpha

# Read and write files safely in isolation
genos world write-file <WORLD_ID> --path "src/lib.rs" --content "<DATA>"
genos world read-file <WORLD_ID> --path "src/lib.rs"

# Compare and snapshot worlds
genos world diff <WORLD_A> <WORLD_B>
genos world snapshot <WORLD_ID> --out <CAS_HASH>
genos world destroy <WORLD_ID>
```

---

## 5. Software Development Trajectory Tools (`genos dev`)

Trajectory engineering tools for evidence-based problem solving, causal tracing, and knowledge curation.

### `genos dev diagnose`
Constructs a falsification-oriented hypothesis tree prior to code mutation.
```bash
genos dev diagnose "Worker deadlock under load" \
  --hypothesis "Queue buffer exhaustion" \
  --hypothesis "Lock order inversion"
```
**JSON Output**:
```json
{
  "diagnosis_id": "diag_01H8X",
  "problem": "Worker deadlock under load",
  "hypotheses": [
    {"id": "h1", "claim": "Queue buffer exhaustion", "status": "unverified", "confidence": 0.5},
    {"id": "h2", "claim": "Lock order inversion", "status": "unverified", "confidence": 0.5}
  ]
}
```

### `genos dev hypothesis-evidence`
Attaches concrete verification results (logs, test outputs) to update hypothesis confidence.
```bash
genos dev hypothesis-evidence <DIAGNOSIS_ID> <HYPOTHESIS_ID> \
  --claim "Thread dump shows lock inversion" \
  --source "tests/deadlock_test.log" \
  --confidence 0.96
```

### `genos dev solve` & `evaluate-trajectories`
Generates parallel candidate implementation paths and ranks them against objective metrics.
```bash
genos dev solve "Refactor storage layer" --strategy "Async tokio" --strategy "Threaded crossbeam" --branches 4
genos dev evaluate-trajectories <SOLVE_ID> --score "traj_1=0.92" --score "traj_2=0.45" --keep 1
```

### `genos dev record-decision` & `blame`
Records Architecture Decision Records (ADRs) linked to hypotheses and traces code provenance.
```bash
genos dev record-decision "Use Lock-Free Queue" \
  --alternative "Mutex Queue" \
  --evidence "benchmarks/queue_perf.json" \
  --code-ref "crates/genos-core/src/queue.rs:24"
genos dev blame "crates/genos-core/src/queue.rs:24"
```

### `genos dev invalidate-assumption`
Invalidates an architectural assumption and calculates cascade impact across decisions and tests.
```bash
genos dev invalidate-assumption "Queue throughput exceeds 1M ops/sec" \
  --observed "Observed 150k ops/sec on ARM64"
```

### `genos dev record-experience` & `search-failures`
Indexes reusable positive and negative knowledge to prevent repetitive errors across agents.
```bash
genos dev record-experience "Spinlock on single-core" \
  --context "ARM64 container" \
  --outcome "CPU starvation deadlock" \
  --successful false
genos dev search-failures "Spinlock container"
```

### `genos dev cherry-pick-experience`
Transfers a verified cognitive insight from a speculative branch without merging file changes.
```bash
genos dev cherry-pick-experience <EXPERIENCE_ID> --to-branch main
```

### `genos dev adversarial-review` & `future-ci`
Plans blind multi-persona reviews and validates patches across future dependency matrices.
```bash
genos dev adversarial-review "pr_patch.diff" --critic security --critic concurrency --blind true
genos dev future-ci "HEAD" --world "rust-1.88" --world "tokio-v2"
```

### `genos dev repository-genome` & `compile-memory`
Defines repository invariants and compiles working context into minimal durable memory.
```bash
genos dev repository-genome \
  --invariant "Max 400 lines per file" \
  --convention "Max 3 parameters per function"
genos dev compile-memory \
  --fact "Storage engine is event-sourced" \
  --decision "ADR-0042 accepted"
```

### `genos dev bisect-agent` & `analyze-trajectory`
Pinpoints cognitive regression points and detects repetitive action loops.
```bash
genos dev bisect-agent --state "s1=good" --state "s2=good" --state "s3=bad" --dimension events
genos dev analyze-trajectory --step "s1|good|act_init|bel_ok" --step "s2|bad|retry|bel_stuck"
```

---

## 6. Counterfactual Experiments (`genos experiment`)

Executes formal counterfactual simulation suites defined in YAML/JSON manifests.

| Subcommand | Syntax | Description |
|---|---|---|
| `workspace` | `genos experiment workspace --repo <PATH> --plan <PLAN>` | Multi-world workspace refactoring suite. |
| `causal-replay` | `genos experiment causal-replay <MANIFEST>` | Replays historical decisions under perturbations. |
| `incident` | `genos experiment incident --snapshot <ID> --evidence <FILE> --search-plan <PLAN>` | Production root-cause isolation. |
| `scientific` | `genos experiment scientific --dataset <DATA> --research-plan <PLAN>` | Automated hypothesis falsification. |
| `security-coevolution` | `genos experiment security-coevolution --environment <ENV> --evolution-plan <PLAN>` | Red/Blue team adversarial co-evolution. |
| `bug-investigation` | `genos experiment bug-investigation --repo <PATH> --plan <PLAN>` | Multi-branch bug isolation matrix. |

---

## 7. Resilience & Biomimicry Commands

### Resilience Subcommands (`genos resilience`)
- `apoptosis`: Graceful agent self-termination to protect world state integrity.
  ```bash
  genos resilience apoptosis --agent-id agent-worker-4
  ```
- `cryptobiosis`: Freezes active runtime state into cold compressed stasis.
  ```bash
  genos resilience cryptobiosis --mode offline
  ```
- `hypermutation`: Triggers stochastic parameter fuzzing when progress is stalled.
  ```bash
  genos resilience hypermutation --target genomes/agent.yaml
  ```
- `circuit-breaker`: Halts a runaway counterfactual branch exceeding error or budget ceilings.
  ```bash
  genos resilience circuit-breaker --branch-id branch-9
  ```

### Biomimicry Subcommands (`genos biomimicry`)
- `swarm-consensus`: Gathers decentralized consensus across worker agents.
  ```bash
  genos biomimicry swarm-consensus --target ADR-0015
  ```
- `flocking-explore`: Launches Boids-algorithm distributed exploration across codebase.
  ```bash
  genos biomimicry flocking-explore --area crates/genos-store
  ```
- `network-quorum`: Evaluates distributed node synchronization and consensus state.
  ```bash
  genos biomimicry network-quorum --node node-us-east-1
  ```
- `distributed-huddle`: Synchronizes shared working memory across ephemeral agents.
  ```bash
  genos biomimicry distributed-huddle --state-file .genos/huddle.json
  ```

---

## 8. Hallucination Mitigation Commands (`genos hallucination`)

Commands for detecting, injecting, testing, and correcting agent confabulations.

```bash
genos hallucination detect [--trace <PATH>]
genos hallucination inject --target-belief <KEY>
genos hallucination test --suite <PATH>
genos hallucination correct --agent-id <ID>
genos hallucination simulate --model <NAME>
```
