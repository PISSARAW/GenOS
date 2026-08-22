# GenOS Quickstart Tutorial: End-to-End Autonomous Agent Lifecycle

This tutorial provides a hands-on walkthrough of creating an agent genome,
capturing a snapshot, provisioning isolated execution capsules, exploring
counterfactual hypotheses across sibling branches, diffing states, performing
Cognitive Merge, and replaying the resulting event stream.

The commands below are implemented by the Rust CLI in `crates/genos-cli`.
From the repository root, build it first:

```bash
cargo build -p genos-cli
```

Use `cargo run -p genos-cli -- ...` in place of `genos ...` unless the binary
has been installed or added to `PATH`. Identifiers and timestamps in the
sample output are illustrative; actual values are generated locally.

---

## 1. End-to-End Lifecycle Workflow

```text
                                  +---------------------------------------+
                                  | Step 1: genos agent init              |
                                  +---------------------------------------+
                                                      │
                                                      ▼
                                  +---------------------------------------+
                                  | Step 2: genos agent create (atlas)    |
                                  +---------------------------------------+
                                                      │
                                                      ▼
                                  +---------------------------------------+
                                  | Step 3: genos snapshot create (S0)    |
                                  +---------------------------------------+
                                                      │
                                                      ▼
                                  +---------------------------------------+
                                  | Step 4: genos capsule create (CAP_ID) |
                                  +---------------------------------------+
                                                      │
                                                      ▼
                                  +---------------------------------------+
                                  | Step 5: genos agent fork              |
                                  +---------------------------------------+
                                           │                     │
                        ┌──────────────────┴──┐               ┌──┴──────────────────┐
                        ▼                                     ▼
             +─────────────────────+               +─────────────────────+
             | Branch A (Fix Patch)|               | Branch B (Refactor) |
             +─────────────────────+               +─────────────────────+
                        │                                     │
                        │ Step 6: genos agent mutate          │ Step 7: genos agent run
                        ▼                                     ▼
             [ Test: PASS (14ms) ]                 [ Test: PASS (2ms) ]
                        │                                     │
                        └──────────────────┬──┘
                                           │
                                           ▼
                                  +---------------------------------------+
                                  | Step 8: genos agent diff              |
                                  +---------------------------------------+
                                                      │
                                                      ▼
                                  +---------------------------------------+
                                  | Step 9: genos agent merge             |
                                  +---------------------------------------+
                                                      │
                                                      ▼
                                  +---------------------------------------+
                                  | Step 10: genos agent lineage          |
                                  +---------------------------------------+
                                                      │
                                                      ▼
                                  +---------------------------------------+
                                  | Step 11: genos agent replay           |
                                  +---------------------------------------+
```

---

## Step 1: Initialize the Local Workspace

Initialize local metadata catalogs, Content-Addressable Storage (CAS), and the SQLite snapshot index:

```bash
genos agent init
```

*Expected Terminal Output:*
```text
[INFO genos_store::cas] Initialized Content-Addressable Storage at ~/.genos/data/cas
[INFO genos_store::snapshot] Initialized local snapshot index at ~/.genos/data/snapshots/agent-snapshots-manifests.jsonl
[SUCCESS] GenOS local environment initialized successfully at .genos/
```

---

## Step 2: Create the Agent Genome (`atlas`)

Define the immutable genotype for an autonomous engineer named `atlas`:

```bash
genos agent create --name atlas --role software_engineer --out atlas.yaml
```

*Expected Terminal Output:*
```yaml
id: 018f3b20-7a11-7000-8000-000000000001
name: atlas
role: software_engineer
prompt: "You are Atlas, a principal software engineer responsible for systems reliability and high-performance algorithms."
drives:
  accuracy: 0.95
  exploration: 0.10
  safety_invariants: 0.99
operons:
  - file_ops
  - git_ops
  - shell_exec
created_at: 2026-08-21T08:00:00Z
```

---

## Step 3: Capture the Baseline Snapshot $S_0$

Create an initial immutable snapshot manifest linking the genome to working memory:

```bash
genos snapshot create --agent atlas.yaml --out atlas-s0.json
```

*Expected Terminal Output:*
```json
{
  "snapshot_id": "snap-018f3b20-s0-root",
  "agent_id": "018f3b20-7a11-7000-8000-000000000001",
  "branch_id": "main",
  "genome_hash": "cas://sha256-4d8e7b1a20cf91823abce01928471bade8291039847120398120394871203948",
  "state_hash": "cas://sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "created_at": "2026-08-21T08:00:05Z"
}
```

---

## Step 4: Create an Execution Capsule with Resource Budget

Provision an execution sandbox binding snapshot $S_0$ to a 100-step computational budget:

```bash
genos capsule create --snapshot atlas-s0.json --budget-steps 100
```

*Expected Terminal Output:*
```text
[SUCCESS] Provisioned Capsule:
  Capsule ID: cap-018f-atlas
  Root Snapshot: snap-018f3b20-s0-root
  Budget Allocation: 100 steps | 500,000 tokens | 60,000 ms wallclock
  Sandbox Path: .genos/sandboxes/cap-018f-atlas
  Status: READY
```

---

## Step 5: Fork Counterfactual Hypotheses Branches

Fork two isolated sibling branches from capsule `cap-018f-atlas` to test competing remediation strategies:

```bash
genos agent fork cap-018f-atlas \
  --branch branch-a=patch-strategy \
  --branch branch-b=refactor-strategy
```

*Expected Terminal Output:*
```text
[INFO genos_runtime::capsules] Forking capsule cap-018f-atlas into 2 sibling branches...
[SUCCESS] Forked Branch A:
  Branch ID: branch-a
  Worktree: .genos/sandboxes/cap-018f-atlas-branch-a
[SUCCESS] Forked Branch B:
  Branch ID: branch-b
  Worktree: .genos/sandboxes/cap-018f-atlas-branch-b
```

---

## Step 6: Mutate Agent Drives for Elevated Exploration

Increase exploration drive $\mathbf{d}_{\text{exploration}} = 0.20$ to encourage non-linear problem solving:

```bash
genos agent mutate atlas.yaml --drive exploration=0.2 --out atlas-mutated.yaml
```

*Expected Terminal Output:*
```yaml
id: 018f3b20-7a11-7000-8000-000000000001
name: atlas
role: software_engineer
drives:
  accuracy: 0.95
  exploration: 0.20
  safety_invariants: 0.99
mutation_metadata:
  parent_genome: atlas.yaml
  delta: { exploration: +0.10 }
```

---

## Step 7: Execute Command Inside Isolated Sandbox

Run verification test suite inside the isolated branch sandbox:

```bash
genos agent run cap-018f-atlas-branch-a --command "cargo test"
```

*Expected Terminal Output:*
```text
[INFO genos_world::git_worktree] Executing command in .genos/sandboxes/cap-018f-atlas-branch-a
[STDOUT] Compiling demo_core v0.1.0 (.genos/sandboxes/cap-018f-atlas-branch-a)
[STDOUT] Running unittests src/lib.rs
[STDOUT] test tests::test_concurrency_deadlock ... ok
[STDOUT] test result: ok. 1 passed; 0 failed; 0 ignored; finished in 0.014s
[SUCCESS] Step executed cleanly (exit code: 0, cost: 420 tokens, steps_remaining: 99)
```

---

## Step 8: Diff Logical State Between Checkpoints

Compute semantic and filesystem deltas between baseline $S_0$ and candidate branch $S_{\text{branch-a}}$:

```bash
genos agent diff atlas-s0.json atlas-s1-branch-a.json
```

*Expected Terminal Output:*
```json
{
  "snapshot_a": "snap-018f3b20-s0-root",
  "snapshot_b": "snap-018f3b20-s1-branch-a",
  "epistemic_belief_deltas": [
    {
      "subject": "concurrency_lock",
      "predicate": "deadlock_probability",
      "old_confidence": 0.88,
      "new_confidence": 0.01
    }
  ],
  "filesystem_deltas": [
    {
      "path": "src/lock.rs",
      "change_type": "modified",
      "lines_added": 8,
      "lines_removed": 2
    }
  ]
}
```

---

## Step 9: Perform Cognitive Merge from Experiment Manifest

Reconcile verified branch discoveries into production checkpoint $S_{\text{prod}}$ using `manifest.json`:

```bash
genos agent merge manifest.json
```

Where `manifest.json` specifies:
```json
{
  "base_snapshot": "atlas-s0.json",
  "winner_branch": "branch-a",
  "merge_strategy": "bayes_weighted_consensus",
  "output_snapshot": "atlas-s1-prod.json"
}
```

*Expected Terminal Output:*
```text
[INFO genos_synaptic::cognitive_merge] Merging epistemic graphs: base=snap-s0 winner=branch-a
[INFO genos_world::diff] Applied patch to target workspace cleanly.
[SUCCESS] Checkpoint snap-s1-prod minted and committed to primary lineage.
```

---

## Step 10: Inspect Snapshot Lineage DAG

View the cryptographic lineage tree showing provenance and branch relationships:

```bash
genos agent lineage --snapshot atlas-s1-prod.json
```

*Expected Terminal Output:*
```text
snap-018f3b20-s0-root [main] (Genesis Checkpoint)
├── snap-018f3b20-s1-branch-a [branch-a] (Mutex remediation: PASS)
│   └── snap-018f3b20-s1-prod [main] (Cognitive Merge Target)
└── snap-018f3b20-s1-branch-b [branch-b] (Lockfree remediation: ABANDONED)
```

---

## Step 11: Execute Deterministic Causal Replay

Verify the integrity and exact causal determinism of the entire trajectory:

```bash
genos agent replay --snapshot atlas-s1-prod.json
```

*Expected Terminal Output:*
```text
[INFO genos_runtime::causal_replay] Replaying 8 events for snapshot snap-018f3b20-s1-prod...
  [1/8] Event: AgentCreated (ID: 018f3b20...) ........................ [VERIFIED]
  [2/8] Event: CapsuleProvisioned (ID: cap-018f...) ................... [VERIFIED]
  [3/8] Event: BranchForked (branch-a, branch-b) ..................... [VERIFIED]
  [4/8] Event: ToolExecuted (cargo test -> exit 0) ................... [VERIFIED]
  [5/8] Event: BeliefUpdated (deadlock_probability -> 0.01) .......... [VERIFIED]
  [6/8] Event: CognitiveMergeCommitted (winner: branch-a) ............. [VERIFIED]
[SUCCESS] 100% Causal Replay Verified. Trajectory matches cryptographic Merkle root exactly.
```
