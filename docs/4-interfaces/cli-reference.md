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
Most subcommands support `--format json|yaml` (default varies by subcommand, typically `json` for programmatic tools and `yaml` for agent genomes). A plain-text output exists only where explicitly listed, such as `genos diff`.

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
# Create, save, retrieve
genos snapshot create --agent <GENOME_PATH> [--memory KEY=VALUE]... [--semantic-ref <ID>]... [--out <PATH>]
genos snapshot save --snapshot <PATH> [--store <PATH>] [--root <PATH>]
genos snapshot get --snapshot-id <SNAPSHOT_ID>
genos snapshot list [--root <PATH>]

# Compare counterfactual siblings
genos snapshot compare --a <REF> --b <REF> [--expect-same-state] [--expect-distinct-identity] \
  [--expect-differing-field <FIELD>]...

# State introspection & mutation (all take --snapshot <REF>)
genos snapshot set-var --snapshot <REF> --key <KEY> --value <JSON_VALUE> [--save] [--emit-events]
genos snapshot check-var --parent <REF> --branch <REF>... [--expect <VALUE>]... [--expect-isolated]
genos snapshot set-cognition --snapshot <REF> [--drive KEY=FLOAT]... [--planning-depth <N>] [--save]
genos snapshot add-memory --snapshot <REF> --kind semantic|episodic --content "<TEXT>" [--source <SRC>]
genos snapshot set-belief --snapshot <REF> --subject <S> --predicate <P> --object <O> \
  --confidence <FLOAT> [--evidence <TOOL_OUTPUT_ID>]...
genos snapshot record-tool-call --snapshot <REF> --tool-name <NAME> [--input <JSON>] [--output <JSON>] [--success true|false]

# Lifecycle
genos snapshot restore --snapshot <REF> --source <REF> [--expect-same-state] [--save] [--emit-events]
genos snapshot checkpoint --snapshot <REF> [--expect-fresh-id] [--expect-same-branch]
genos snapshot lineage [--snapshot <ID>|--root <ID>] [--format json|yaml|text] [--full-id]
```

Snapshot references (`<REF>`) accept either a file path or a snapshot id resolved in the snapshot store (`--snapshots`, default `.genos/snapshots/`).

---

## 4. World Workspace Commands (`genos world`)

Manages isolated directory and Git worktree execution sandboxes.

```bash
# Create an isolated world sandbox (provider: directory | git-worktree)
genos world create --provider git-worktree --repo-root . --name world-alpha

# Read and write files safely in isolation
genos world write-file <WORLD_ID> --path "src/lib.rs" --content "<DATA>"
genos world read-file <WORLD_ID> --path "src/lib.rs"

# Fork, compare and snapshot worlds
genos world fork <WORLD_ID> [--count 2]
genos world diff <WORLD_A> <WORLD_B>
genos world snapshot <WORLD_ID> --out <CAS_HASH>

# Execute a command inside the world and verify isolation
genos world run <WORLD_ID> --command "cargo test"
genos world check-file <PARENT_WORLD_ID>

# Release the sandbox
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
| `temporal` | `genos experiment temporal <MANIFEST>` | Replays one historical event stream through several causal universes. |
| `causal-replay` | `genos experiment causal-replay <MANIFEST>` | Replays historical decisions under perturbations. |
| `incident` | `genos experiment incident --snapshot <ID> --evidence <FILE> --search-plan <PLAN>` | Production root-cause isolation. |
| `scientific` | `genos experiment scientific --dataset <DATA> --research-plan <PLAN>` | Automated hypothesis falsification. |
| `security-coevolution` | `genos experiment security-coevolution --environment <ENV> --evolution-plan <PLAN>` | Red/Blue team adversarial co-evolution. |
| `bug-investigation` | `genos experiment bug-investigation --repo <PATH> --plan <PLAN>` | Multi-branch bug isolation matrix. |
| `heredity` | `genos experiment heredity <MANIFEST>` | Analyzes a fixed-genome cohort under controlled treatments. |
| `select` | `genos experiment select <MANIFEST>` | Applies hard constraints and Pareto selection to evaluated genomes. |
| `reproducibility` | `genos experiment reproducibility <MANIFEST>` | Evaluates functional reproducibility from paired behavior traces. |
| `cognitive-merge` | `genos experiment cognitive-merge <MANIFEST>` | Reconciles branch claims without unioning their memories. |
| `branch-evolution` | `genos experiment branch-evolution <MANIFEST>` | Allocates compute, eliminates weak branches, and forks survivors recursively. |

All subcommands accept a complete YAML/JSON manifest positionally, or direct input flags where documented, plus `--format json|yaml`.

---

## 7. Resilience & Biomimicry Commands

### Resilience Subcommands (`genos resilience`)
- `apoptosis`: Graceful agent self-termination to protect world state integrity.
  ```bash
  genos resilience apoptosis --agent-id agent-worker-4
  ```
- `cryptobiosis`: Freezes real agent state into a cold spore file. The payload
  comes from either `--state-file` (raw bytes) or `--state-data` (literal text);
  one of the two is required.
  ```bash
  genos resilience cryptobiosis --mode offline --state-file .genos/state.bin
  genos resilience cryptobiosis --mode offline --state-data "worker-4 checkpoint v3"
  ```
- `hypermutation`: Triggers stochastic parameter fuzzing when progress is stalled.
  When `<TARGET>` is an existing file its contents are fuzzed; otherwise the
  literal string is used.
  ```bash
  genos resilience hypermutation --target genomes/agent.yaml
  ```
- `circuit-breaker`: Halts a runaway counterfactual branch exceeding error or budget ceilings.
  ```bash
  genos resilience circuit-breaker --branch-id branch-9 --failures 3 --threshold 3
  ```

### Biomimicry Subcommands (`genos biomimicry`)
- `swarm-consensus`: Gathers decentralized consensus across worker agents. Cast one or more votes with repeatable `--vote explore|exploit|rest`.
  ```bash
  genos biomimicry swarm-consensus --target ADR-0015 --vote explore --vote exploit --vote explore
  ```
- `flocking-explore`: Launches Boids-algorithm distributed exploration across codebase.
  ```bash
  genos biomimicry flocking-explore --area crates/genos-store --steps 4 --x 0.0 --y 0.0
  ```
- `network-quorum`: Evaluates distributed node synchronization and consensus state against a sensed signal level and activation threshold.
  ```bash
  genos biomimicry network-quorum --node node-us-east-1 --signal 90 --threshold 80
  ```
- `distributed-huddle`: Synchronizes shared working memory across ephemeral agents. Reads the JSON member list from `--state-file` when it exists, shares heat, then writes the updated energies back.
  ```bash
  genos biomimicry distributed-huddle --state-file .genos/huddle.json
  ```

---

## 8. Hallucination Mitigation Commands (`genos hallucination`)

Commands for detecting, injecting, testing, extracting, analyzing, correcting, and simulating agent confabulations. Grounding is verified against execution receipts: a belief counts as grounded only when every piece of evidence points at a recorded, successful tool output whose receipt the environment verified.

```bash
# Audit a snapshot (or JSONL trace) for missing receipts and ungrounded claims
genos hallucination detect [--snapshot <REF>|--trace <PATH>] [--fail-on-findings]

# Inject a controlled false premise into a snapshot for red teaming
genos hallucination inject --snapshot <REF> --target-belief <KEY> [--save] [--emit-events]

# ImpossibleBench-style suite (YAML/JSON array of { subject, expect }): exits non-zero on failures.
genos hallucination test --suite <PATH> --snapshot <REF>

# Export the belief evidence graph (nodes + contradicts/evidence edges)
genos hallucination extract --snapshot <REF> [--out <PATH>] [--format json|yaml]

# Semantic-entropy metrics over the snapshot's beliefs with a risk verdict
genos hallucination analyze --snapshot <REF> [--format json|yaml]

# Reject every ungrounded belief via process supervision (--agent-id must own the snapshot)
genos hallucination correct --agent-id <ID> --snapshot <REF> [--save] [--expect-rejections]

# Replay an injection inside an isolated in-memory fork and report what detection flags
genos hallucination simulate --model <NAME> --snapshot <REF> [--out <PATH>]
```

The remaining command families — capsule lifecycle, replay & inspection, workflows, RAG, prompts, evaluation datasets, plus the `detect` output schema and finding kinds — are documented in the [extended CLI reference](cli-reference-extended.md).

