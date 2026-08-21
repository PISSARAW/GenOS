# Cognitive Loops & The Safest Revert Point Algorithm

When autonomous AI agents execute multi-step objectives, they are susceptible to **cognitive failure loops** (repetitive tool calls, oscillating thought patterns, state stagnation) and **latent bugs** introduced several steps before an observable crash. GenOS combines real-time **Circuit Breaker Loop Detection** with a DAG-based **Safest Revert Point (Last Known Good State - LKGS)** rollback and cherry-picking engine.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                        Cognitive Loop Detection & Rollback Engine                        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│    [ Agent Step Execution ] ──► [ Circuit Breaker Monitoring ]                           │
│                                           │                                              │
│                     ┌─────────────────────┴─────────────────────┐                        │
│                     ▼                                           ▼                        │
│           [ Loop / Failure Detected ]                 [ Healthy Execution ]              │
│                     │                                           │                        │
│                     ▼                                           ▼                        │
│           [ Action DAG Analysis ]                      [ Append to Ledger ]              │
│                     │                                                            │
│                     ▼                                                            │
│           [ Trace Root Cause Step T_root ]                                       │
│                     │                                                            │
│                     ▼                                                            │
│           [ Compute LKGS = T_root - 1 ]                                          │
│                     │                                                            │
│                     ▼                                                            │
│           [ Backward Causal Taint Propagation ]                                  │
│                     │                                                            │
│                     ▼                                                            │
│           [ Rollback World to LKGS & Cherry-Pick Clean Actions ]                 │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Real-Time Cognitive Loop Detection (Circuit Breakers)

The `CircuitBreaker` in `crates/genos-core/src/loop_detection.rs` monitors execution at every step across three orthogonal heuristics:

```rust
pub enum CognitiveLoopError {
    ExactSignatureMatch { tool_name: String, count: usize },
    StateStagnation { count: usize },
    SemanticSimilarity { similarity: f32, threshold: f32 },
}

pub struct CircuitBreaker {
    pub history: Vec<IterationSnapshot>,
    pub exact_match_threshold: usize,        // Default: 3
    pub stagnation_threshold: usize,         // Default: 5
    pub semantic_similarity_threshold: f32,  // Default: 0.95
}
```

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Loop Detection Heuristics                                │
├─────────────────────────┬───────────┬──────────────────────────────────────────────────┤
│ Heuristic               │ Threshold │ Detection Rule                                   │
├─────────────────────────┼───────────┼──────────────────────────────────────────────────┤
│ Exact Signature Match   │ 3 calls   │ Identical `(tool_name, arguments_hash)` across   │
│                         │           │ 3 consecutive iterations                         │
├─────────────────────────┼───────────┼──────────────────────────────────────────────────┤
│ State Stagnation        │ 5 steps   │ `world_state_hash` unmodified across 5 steps     │
├─────────────────────────┼───────────┼──────────────────────────────────────────────────┤
│ Semantic Thought Loop   │ $\ge 0.95$│ $\cos(\mathbf{e}_N, \mathbf{e}_{N-2}) \ge 0.95$  │
│ (Oscillation)           │           │ (Agent ping-pongs between two reasoning states)  │
└─────────────────────────┴───────────┴──────────────────────────────────────────────────┘
```

### Semantic Cosine Similarity Formalism:
$$\text{Similarity}(\mathbf{e}_N, \mathbf{e}_{N-2}) = \frac{\sum_{i=1}^d e_{N, i} \cdot e_{N-2, i}}{\sqrt{\sum_{i=1}^d e_{N, i}^2} \cdot \sqrt{\sum_{i=1}^d e_{N-2, i}^2}}$$
When an error is detected, execution aborts immediately with `CognitiveLoopError`, preventing budget exhaustion and invoking the automated revert solver.

---

## 2. Action Dependency Graph (DAG) & Causal Tracking

To isolate the true root cause of a defect without naively reverting unrelated progress, GenOS records every action in an `ActionDependencyGraph`:

```rust
pub struct CausalAction {
    pub step_index: usize,
    pub boundary_id: String,
    pub reads: Vec<EntityRef>,   // e.g. EntityRef::File("src/parser.rs")
    pub writes: Vec<EntityRef>,  // e.g. EntityRef::File("src/ast.rs")
}

pub struct ActionDependencyGraph {
    pub actions: Vec<CausalAction>,
}
```

### Causal Dependency Scenario:
```text
Step 1: Write(File_A)                 [Independent Action 1]
   │
Step 2: Write(File_B) ◄────────────┐  [Root Cause of Failure]
   │                               │
Step 3: Read(File_B) + Write(File_C)  [Tainted Propagation]
   │                               │
Step 4: Write(File_D)                 [Independent Action 2]
   │
Step 5: Error Detected on File_C! ─┘
```

---

## 3. The Safest Revert Point Algorithm (LKGS)

A naive chronological rollback to $T_{N-1}$ fails because the bug was introduced at $T_2$. Conversely, rolling back everything to $T_1$ destroys the valid work done at $T_4$ on `File_D`.

The `SafestRevertSolver` in `crates/genos-core/src/revert.rs` resolves this via **Causal Taint Analysis & Selective Cherry-Picking**:

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │ Step 1: Backward Causal Taint Propagation                              │
 │ Initialize Tainted Set: T = { File_C }                                 │
 │ Traverse actions backwards from Step 4 down to Step 0:                 │
 │ • Step 4 (Write File_D): Writes ∩ T = ∅ ──► Clean                      │
 │ • Step 3 (Read File_B, Write File_C): Writes ∩ T ≠ ∅                   │
 │   ──► Taint expanded: T ← T ∪ { File_B }, Root Candidate = Step 3      │
 │ • Step 2 (Write File_B): Writes ∩ T ≠ ∅                                │
 │   ──► Root Cause identified: T_root = Step 2                           │
 │ • Step 1 (Write File_A): Writes ∩ T = ∅ ──► Clean                      │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ Step 2: Determine Last Known Good State (LKGS)                         │
 │ LKGS = max(0, T_root - 1) = max(0, 2 - 1) = Step 1                     │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ Step 3: Extract Cherry-Pickable Clean Actions                          │
 │ For each action k ∈ (LKGS, T_error):                                   │
 │   Condition: reads(k) ∩ T = ∅ ∧ writes(k) ∩ T = ∅                      │
 │   Step 4 on File_D satisfies condition ──► Marked for Cherry-Pick      │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ Step 4: Reconstitute & Reapply                                         │
 │ Roll back world substrate to Snapshot(LKGS = 1).                       │
 │ Reapply Step 4 (Write File_D) on top of clean baseline.                │
 └────────────────────────────────────────────────────────────────────────┘
```

### Algorithmic Implementation:
```rust
pub struct RevertTarget<'a> {
    pub error_step: usize,
    pub error_entities: &'a [EntityRef],
    pub boundaries: &'a [CausalBoundary],
}

impl SafestRevertSolver {
    pub fn compute_safest_revert(
        graph: &ActionDependencyGraph,
        target: &RevertTarget,
    ) -> Option<(CausalBoundary, Vec<CausalAction>)> {
        // 1. Identify LKGS step index
        let lkgs_step = graph.find_last_known_good_state(target.error_step, target.error_entities)?;
        let safe_boundary = target.boundaries.get(lkgs_step)?.clone();

        // 2. Compute full tainted transitive set
        let mut tainted = target.error_entities.to_vec();
        for action in graph.actions.iter().rev() {
            if action.step_index < target.error_step && action.step_index >= lkgs_step {
                if check_intersection(action.writes.iter(), tainted.iter()) {
                    for r in &action.reads { if !tainted.contains(r) { tainted.push(r.clone()); } }
                    for w in &action.writes { if !tainted.contains(w) { tainted.push(w.clone()); } }
                }
            }
        }

        // 3. Extract clean actions
        let cherry_picks = graph.extract_cherry_pickable_actions(lkgs_step, target.error_step, &tainted);

        Some((safe_boundary, cherry_picks))
    }
}
```

---

## 4. Counterfactual Tree Search & MCTS Backtracking

In high-complexity tasks (e.g., architectural refactoring, subtle security audits), GenOS integrates the safest revert algorithm into a Monte Carlo Tree Search (MCTS) exploration harness guided by Process Reward Models (PRM):

```text
                                  Root Snapshot S_0
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
                Branch Alpha                              Branch Beta
              (PRM Score: 0.42)                         (PRM Score: 0.88)
                     │                                         │
                     ▼                                         ▼
             [ Loop Detected ]                          Step B_1 (0.91)
                     │                                         │
                     ▼                                         ▼
            [ Safest Revert to S_0 ]                    Step B_2 (0.95)
                     │                                         │
                     ▼                                         ▼
           Prune Branch Alpha                           ★ Success Sealed
```

### MCTS Search Protocol:
1. **Selection (UCT)**: Selects promising branches balancing exploitation of high PRM scores with exploration of under-visited trajectories:
   $$\text{UCT}(v) = Q(v) + c \cdot \sqrt{\frac{\ln N(v.\text{parent})}{N(v)}}$$
2. **Process Reward Scoring**: Every intermediate step is evaluated by the PRM ($r_t \in [0, 1]$).
3. **Counterfactual Backtracking**: If a branch exhibits a cognitive loop or its cumulative PRM score drops below a dynamic pruning threshold $\tau$, the engine executes a `restore` to the nearest LKGS and expands alternative sibling hypotheses.
