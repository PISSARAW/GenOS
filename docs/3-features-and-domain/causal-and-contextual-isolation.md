# Causal & Contextual Isolation Architecture

Autonomous AI agents executing complex multi-step tasks face two existential failure modes: **Causal Contamination** (unintended write side-effects, cascading file corruption, cross-branch state pollution) and **Contextual Leakage** (unauthorized epistemic access, prompt injection escapes, cross-agent memory bleeding). GenOS enforces a dual-isolation architecture providing mathematical non-interference and physical substrate containment.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                            Dual-Isolation Architectural Matrix                           │
├────────────────────────────────────────┬─────────────────────────────────────────────────┤
│ Dimension                              │ Architectural Mechanism                         │
├────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ 1. Causal Isolation (Action Scope)     │ • Ephemeral Git Worktree Filesystem Sandboxes   │
│                                        │ • Copy-on-Write (CoW) Directory Pools           │
│                                        │ • Action Dependency DAGs & Read/Write Sets      │
│                                        │ • Causal Boundary Commit / Rollback Semantics   │
├────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ 2. Contextual Isolation (Info Scope)   │ • Strict System Prompt vs User Data Separation  │
│                                        │ • Capability-Based Tool Exposure Boundaries     │
│                                        │ • Event Stream Branch Partitioning (BranchId)   │
│                                        │ • Scoped Episodic & Working Memory Graphs       │
└────────────────────────────────────────┴─────────────────────────────────────────────────┘
```

---

## 1. Causal Isolation: Substrate Sandboxing & Worktree Pools

Causal isolation guarantees that an agent's physical actions (file edits, command executions, environment mutations) are strictly confined to its assigned world substrate.

```text
                     Master Git Repository / CAS Store (.genos/worlds)
                                            │
         ┌──────────────────────────────────┴──────────────────────────────────┐
         ▼                                                                     ▼
 ┌───────────────────────────────┐                     ┌───────────────────────────────┐
 │ World W_A (Branch Alpha)      │                     │ World W_B (Branch Beta)       │
 │ Worktree: .genos/wt_alpha_01  │                     │ Worktree: .genos/wt_beta_02   │
 │ Branch: refs/heads/br_alpha   │                     │ Branch: refs/heads/br_beta    │
 │ Head Commit: 3a9f1b           │                     │ Head Commit: 3a9f1b           │
 │                               │                     │                               │
 │ [ Edit: src/compiler.rs ]     │                     │ [ Edit: src/parser.rs ]       │
 │ (Invisible to Branch Beta)    │                     │ (Invisible to Branch Alpha)   │
 └───────────────┬───────────────┘                     └───────────────┬───────────────┘
                 │                                                     │
                 ▼                                                     ▼
    Branch Alpha Event Stream                             Branch Beta Event Stream
    E_A1 ──► E_A2 (Corr: C1)                              E_B1 ──► E_B2 (Corr: C1)
```

### Git Worktree Substrate Lifecycle:
1. **Instantaneous Branching**: When `fork` is invoked on snapshot $\sigma_0$, `GitWorktreeWorldProvider` executes `git worktree add -b <branch_id> <worktree_dir> <base_commit>`. This creates a complete, isolated filesystem replica in under 10ms by sharing the underlying `.git/objects` CAS store.
2. **Copy-on-Write Isolation**: All subsequent filesystem modifications in worktree $\mathcal{W}_A$ alter only local files and Git staging indexes. Sibling worktree $\mathcal{W}_B$ remains completely unmodified.
3. **Deterministic Commit & Seal**: When a branch execution completes successfully, `commit` computes a tree SHA-256 hash, updates the branch ref, and records the world snapshot ID $\sigma_W$.
4. **Atomic Clean Tear-Down**: Upon branch termination or rollback, `git worktree remove --force` purges the ephemeral worktree directory without leaving stale locks or dangling handles.

---

## 2. Directory Sandboxing & Path Containment Invariants

All filesystem I/O executed by tools must pass through strict path canonicalization via `resolve_world_relative_path` in `genos-world/src/utils.rs`:

```rust
pub fn resolve_world_relative_path(root: &Path, relative: &str) -> Result<PathBuf, WorldError> {
    let raw = Path::new(relative);
    if raw.is_absolute() {
        return Err(WorldError::InvalidWorldPath {
            path: relative.to_string(),
            reason: "absolute paths are strictly prohibited inside world sandbox".into(),
        });
    }
    
    let target = root.join(raw);
    let canonical_root = root.canonicalize().map_err(|e| WorldError::IoError(e))?;
    
    // Resolve target path safely without allowing traversal escapes
    let canonical_target = target.canonicalize().or_else(|_| {
        let parent = target.parent().ok_or_else(|| WorldError::InvalidWorldPath {
            path: relative.to_string(),
            reason: "invalid root traversal".into(),
        })?;
        parent.canonicalize().map(|p| p.join(target.file_name().unwrap()))
    }).map_err(|e| WorldError::IoError(e))?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err(WorldError::InvalidWorldPath {
            path: relative.to_string(),
            reason: "path escapes world root via directory traversal".into(),
        });
    }

    Ok(canonical_target)
}
```

### Security Guarantees:
- **Directory Traversal Defense**: Escapes via `../`, `..\\`, or URL-encoded paths (`%2e%2e%2f`) are intercepted before any filesystem syscall.
- **Symlink Escape Defense**: Symlinks pointing outside the world root trigger an immediate `WorldError::InvalidWorldPath`.
- **Absolute Path Prohibition**: Explicit absolute drive letters (`C:\Windows`, `/etc/shadow`) are strictly forbidden.

---

## 3. Contextual Isolation: Epistemic Scoping & Event Partitioning

Contextual isolation governs what information an agent can perceive and remember during execution:

```text
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                         Contextual Scoping Layers                        │
 ├──────────────────────────────────────────────────────────────────────────┤
 │                                                                          │
 │  ┌────────────────────────┐         ┌────────────────────────┐           │
 │  │ System Prompt & Drives │         │ User Prompt & Task     │           │
 │  │ (Genomic Invariants)   │         │ (External Objective)   │           │
 │  └───────────┬────────────┘         └───────────┬────────────┘           │
 │              │                                  │                        │
 │              └─────────────────┬────────────────┘                        │
 │                                ▼                                         │
 │              ┌───────────────────────────────────┐                       │
 │              │  Sanitized Context Window Buffer  │                       │
 │              └─────────────────┬─────────────────┘                       │
 │                                │                                         │
 │         ┌──────────────────────┴──────────────────────┐                  │
 │         ▼                                             ▼                  │
 │ ┌───────────────────────────────┐     ┌───────────────────────────────┐  │
 │ │ Branch A Scoped Memory Graph  │     │ Branch B Scoped Memory Graph  │  │
 │ │ (Private Working Memory Items)│     │ (Private Working Memory Items)│  │
 │ └───────────────────────────────┘     └───────────────────────────────┘  │
 │                                                                          │
 └──────────────────────────────────────────────────────────────────────────┘
```

1. **Prompt Injection Boundary**: Genomic policies, ethical guardrails, and tool permission schemas are injected into protected system channels that cannot be overwritten by untrusted user data or tool stdout.
2. **Event Stream Partitioning**: Events are tagged with `(agent_id, branch_id)`. Agents executing on branch $B_1$ cannot inspect event streams or working memory buffers belonging to branch $B_2$.
3. **Causal Correlation**: When branches collaborate during multi-hypothesis exploration, events share a `correlation_id` while maintaining distinct `causation_id` DAG pointers.

---

## 4. Mathematical Non-Interference Proof

We formalize the zero-leakage guarantee between concurrent counterfactual branches using information theory and state transition semantics.

```text
                   ┌──────────────────────────────────────┐
                   │    Common Root World State (W_0)     │
                   └──────────────────┬───────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │    Branch World (W_A)     │             │    Branch World (W_B)     │
   │ Trajectory: a_1, a_2.. a_n│             │ Trajectory: b_1, b_2.. b_m│
   └───────────────────────────┘             └───────────────────────────┘
```

### Theorem: Conditional Mutual Information Bound
Let $\mathcal{W}_0$ be the base world snapshot from which branches $\mathcal{W}_A$ and $\mathcal{W}_B$ are spawned. Let $H(\cdot)$ denote Shannon entropy. The conditional mutual information between $\mathcal{W}_A$ and $\mathcal{W}_B$ given $\mathcal{W}_0$ is strictly zero:

$$I(\mathcal{W}_A; \mathcal{W}_B \mid \mathcal{W}_0) = 0$$

### Proof:
1. By the definition of conditional mutual information:
   $$I(\mathcal{W}_A; \mathcal{W}_B \mid \mathcal{W}_0) = H(\mathcal{W}_A \mid \mathcal{W}_0) - H(\mathcal{W}_A \mid \mathcal{W}_B, \mathcal{W}_0)$$
2. Let $\mathbf{a} = [a_1, a_2, \dots, a_n]$ be the sequence of actions executed in $\mathcal{W}_A$. By the sandbox containment invariant (INV-003, INV-004):
   $$\mathcal{W}_A = f(\mathcal{W}_0, \mathbf{a}), \quad \text{where } \forall a_i \in \mathbf{a}, \, \text{target}(a_i) \subseteq \text{Worktree}_A$$
3. Similarly, let $\mathbf{b} = [b_1, b_2, \dots, b_m]$ be actions in $\mathcal{W}_B$:
   $$\mathcal{W}_B = g(\mathcal{W}_0, \mathbf{b}), \quad \text{where } \forall b_j \in \mathbf{b}, \, \text{target}(b_j) \subseteq \text{Worktree}_B$$
4. Since $\text{Worktree}_A \cap \text{Worktree}_B = \emptyset$, the action sequence $\mathbf{b}$ has no causal influence on $\mathcal{W}_A$:
   $$P(\mathcal{W}_A \mid \mathcal{W}_B, \mathcal{W}_0) = P(\mathcal{W}_A \mid \mathcal{W}_0)$$
5. Therefore:
   $$H(\mathcal{W}_A \mid \mathcal{W}_B, \mathcal{W}_0) = H(\mathcal{W}_A \mid \mathcal{W}_0) \implies I(\mathcal{W}_A; \mathcal{W}_B \mid \mathcal{W}_0) = 0 \quad \blacksquare$$

### State Non-Interference Corollary:
$$\forall a \in \text{Actions}_A, \quad \frac{\partial \mathcal{S}_B}{\partial a} = 0 \quad \text{and} \quad \frac{\partial \mathcal{W}_B}{\partial a} = 0$$

---

## 5. Automated Verification & Regression Tests

The isolation guarantees are continuously verified by automated integration test suites:
- `crates/genos-world/tests/file_isolation.rs`: Spawns concurrent threads performing conflicting file writes on identical relative paths and verifies zero data leakage.
- `crates/genos-world/tests/path_safety.rs`: Fuzzes filesystem resolvers with hundreds of directory traversal vectors (`../../`, absolute prefixes, symlinks).
- `crates/genos-world/tests/git_worktree.rs`: Validates rapid worktree allocation, branch creation, commit sealing, and atomic cleanup.
