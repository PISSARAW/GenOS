# Cleaner: Autophagy, DAG Mark-and-Sweep & Metabolic Torpor

## 1. Overview & Biological Analogy

In multicellular organisms, physiological survival requires continuous waste removal and nutrient recycling. Two vital biological processes govern this cellular housekeeping:
1. **Autophagy**: The self-degradative mechanism whereby damaged organelles, misfolded proteins, and senescent components are encapsulated in autophagosomes, delivered to lysosomes, and broken down into amino acids to fuel essential metabolism.
2. **Torpor**: A state of regulated metabolic depression and reduced body temperature allowing organisms to survive acute nutrient scarcity, extreme cold, or environmental hyper-stress.

In **GenOS**, the **Cleaner** subsystem (`cleaner.rs`) prevents resource exhaustion, memory leaks, and storage bloat across long-running autonomous workflows. It orchestrates the automated garbage collection of abandoned counterfactual exploration branches, stale Git worktrees, and dangling Content-Addressable Storage (CAS) blobs, while enforcing metabolic torpor during external API backpressure.

```
       +-------------------------------------------------------------+
       |               WORKSPACE & LINEAGE SENESCENCE WATCHDOG       |
       |  - Continuous Tracking of Memory, AST Nodes, and Worktrees  |
       +-------------------------------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
  [Senescent Branch / Stale Blob]                           [Rate Limit 429 / DDoS Spike]
         |                                                         |
         v                                                         v
  +-------------------------------+         +-------------------------------+
  |       AUTOPHAGY & GC          |         |       METABOLIC TORPOR        |
  |  - Mark-and-Sweep Causal DAG  |         |  - Exponential sleep backoff  |
  |  - Prune abandoned worktrees  |         |  - Reduce execution cadence   |
  |  - Unlink 0-ref CAS blobs     |         |  - Preserve working state     |
  +-------------------------------+         +-------------------------------+
         |                                                         |
         +----------------------------+----------------------------+
                                      |
                                      v
         +---------------------------------------------------------+
         |              RECLAIMED SYSTEM POOL & HEALTH             |
         |  - Zero Memory Leaks, Compact DAG, Preserved Quota      |
         +---------------------------------------------------------+
```

---

## 2. Mathematical Formalism of DAG Garbage Collection

### 2.1 Mark-and-Sweep over Causal Lineage DAGs
Let $G = (\mathcal{V}, \mathcal{E})$ represent the complete Causal Lineage Directed Acyclic Graph, where $\mathcal{V}$ are state snapshots/decisions and $\mathcal{E}$ are causal transitions.

Let $\mathcal{R} = \mathcal{H}_{\text{active}} \cup \mathcal{P}_{\text{pinned}}$ be the set of root anchors (active agent head nodes $\mathcal{H}_{\text{active}}$ and user-pinned checkpoints $\mathcal{P}_{\text{pinned}}$).

A node $\nu \in \mathcal{V}$ is **reachable** if and only if there exists a directed path from a root anchor:

$$\text{Reachable}(\nu) \iff \exists r \in \mathcal{R}, \quad r \rightsquigarrow \nu$$

The **Sweep Set** $\mathcal{V}_{\text{dead}}$ to be autophagically reclaimed is defined as:

$$\mathcal{V}_{\text{dead}} = \mathcal{V} \setminus \{\nu \in \mathcal{V} \mid \text{Reachable}(\nu)\}$$

### 2.2 Reference Counting on CAS (Content-Addressable Storage) Blobs
Every immutable code blob $\beta \in \mathcal{B}$ stored in `.genos/cas/` maintains an atomic reference count:

$$\text{RefCount}(\beta) = \sum_{\nu \in \mathcal{V} \setminus \mathcal{V}_{\text{dead}}} \mathbb{I}\left(\text{BlobHash}(\nu) == \text{Hash}(\beta)\right)$$

When $\text{RefCount}(\beta) = 0$, the physical storage file is unlinked and reclaimed.

### 2.3 Tombstone Compaction
When pruned branches are excised from the DAG, sequential unreferenced nodes are collapsed into a single cryptographically attested **Tombstone**:

$$\text{Tombstone}(\nu_i, \dots, \nu_j) = \text{SHA256}\left(\text{Hash}(\nu_i) \,\|\, \text{Hash}(\nu_j) \,\|\, |\mathcal{V}_{\text{pruned}}|\right)$$

---

## 3. The Four Operational Pillars of the Cleaner

### 3.1 Causal DAG Autophagy
Exploratory sub-agents frequently branch hypotheses that fail tests or hit dead ends. The Autophagy engine sweeps these abandoned reasoning subtrees, recycling memory and pruning unneeded scratchpads.

### 3.2 Stale Git Worktree Sweeper
Ephemeral Git worktrees spawned for isolated compiler runs and patch verification (`.genos/worktrees/wt_*`) are automatically unmounted and deleted upon task completion or agent apoptosis.

### 3.3 Metabolic Torpor (Rate Limiting Backoff)
When downstream LLM providers return HTTP 429 (Rate Limit Exceeded) or downstream tools suffer latency degradation, the Torpor engine slows the execution tempo exponentially:

$$\Delta t_{\text{torpor}}(k) = \min\left(\Delta t_{max}, \; \Delta t_0 \cdot 2^k\right)$$

This dissipates queue pressure without losing pending scratchpad states.

### 3.4 Active Redundancy & Hot Spares
The Cleaner maintains synchronized warm-standby worker contexts. If an active worker undergoes autophagy due to critical internal corruption, the warm clone instantly adopts the execution lease.

---

## 4. Rust Architecture & Implementation

```rust
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LineageNode {
    pub id: String,
    pub parents: Vec<String>,
    pub cas_blob_hash: Option<String>,
}

pub struct CausalCleanerEngine {
    dag_nodes: Arc<RwLock<HashMap<String, LineageNode>>>,
    cas_ref_counts: Arc<RwLock<HashMap<String, usize>>>,
}

impl CausalCleanerEngine {
    pub fn new() -> Self {
        Self {
            dag_nodes: Arc::new(RwLock::new(HashMap::new())),
            cas_ref_counts: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Executes Mark-and-Sweep GC from active root heads.
    pub fn sweep_unreachable(&self, active_roots: &[String]) -> usize {
        let nodes = self.dag_nodes.read().unwrap();
        let mut visited = HashSet::new();

        for root in active_roots {
            Self::mark_recursive(root, &nodes, &mut visited);
        }

        let dead_keys: Vec<String> = nodes
            .keys()
            .filter(|k| !visited.contains(*k))
            .cloned()
            .collect();
        drop(nodes);

        let count = dead_keys.len();
        let mut nodes_mut = self.dag_nodes.write().unwrap();
        let mut cas_refs = self.cas_ref_counts.write().unwrap();

        for dead_id in dead_keys {
            if let Some(removed) = nodes_mut.remove(&dead_id) {
                if let Some(blob_hash) = removed.cas_blob_hash {
                    if let Some(ref_count) = cas_refs.get_mut(&blob_hash) {
                        *ref_count = ref_count.saturating_sub(1);
                    }
                }
            }
        }
        count
    }

    fn mark_recursive(current: &str, nodes: &HashMap<String, LineageNode>, visited: &mut HashSet<String>) {
        if visited.insert(current.to_string()) {
            if let Some(node) = nodes.get(current) {
                for parent in &node.parents {
                    Self::mark_recursive(parent, nodes, visited);
                }
            }
        }
    }
}

pub struct TorporGovernor {
    pub last_action: Instant,
    pub interval: Duration,
}

impl TorporGovernor {
    pub fn new(interval: Duration) -> Self {
        Self {
            last_action: Instant::now() - interval,
            interval,
        }
    }

    pub fn check_proceed(&mut self) -> bool {
        let now = Instant::now();
        if now.duration_since(self.last_action) >= self.interval {
            self.last_action = now;
            true
        } else {
            false
        }
    }
}
```

---

## 5. MCP Tool Schema & CLI Reference

### 5.1 MCP Tool Declaration
```json
{
  "name": "genos_resilience_cleaner",
  "description": "Execute autophagy garbage collection, prune dead worktrees, or trigger metabolic torpor.",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["SweepUnreachableDAG", "PruneStaleWorktrees", "CompactCASBlobs", "EnterTorpor"]
      },
      "dry_run": {
        "type": "boolean",
        "description": "Simulate cleanup without unlinking storage"
      }
    },
    "required": ["action"]
  }
}
```

### 5.2 CLI Commands
```bash
# Sweep unreachable causal DAG nodes and dangling CAS blobs
genos cleaner sweep --dry-run=false

# Clean orphaned ephemeral Git worktrees
genos cleaner prune-worktrees --older-than "30m"
```

---

## 6. Operational Invariants & Reclaiming Guarantees

- **Zero Accidental Data Erasure**: Active lineage roots and pinned user checkpoints are strictly immutable and guaranteed never to be swept.
- **Atomic CAS Unlinking**: Blob storage files are unlinked only when their global atomic reference count strictly equals zero.
- **Deterministic Worktree Idempotency**: Pruned worktree directories are cleaned with atomic unmounts, preventing dangling filesystem locks.
