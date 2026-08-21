# Apoptosis: Programmed Agent Termination & State Reclamation

## 1. Overview & Biological Analogy

In cellular biology, **apoptosis** is an orderly, genetically programmed process of cellular suicide that allows an organism to eliminate damaged, infected, or aberrant cells without triggering inflammation or tissue damage (in stark contrast to chaotic *necrosis*).

Within **GenOS**, Apoptosis represents the formal, deterministic termination protocol executed by or upon an autonomous agent when it detects unrecoverable semantic divergence, cyclic hallucination, irrecoverable invariant violations, or resource exhaustion. Rather than allowing a corrupted agent to pollute the shared environment or deplete token budgets, GenOS executes an orderly decommission pipeline:
1. **Death Signal Initiation**: Caspase-cascade equivalent detection and dispatch.
2. **Execution Halt & Isolation**: Immediate cessation of external side-effects and tool invocations.
3. **Memory Compaction (Blebbing)**: Condensation of episodic trajectory into forensic granules.
4. **Resource & Lock Shedding**: Deterministic reclamation of shared resources and mutexes.
5. **Post-Mortem State Capture**: Archival into the Dead Letter Queue (DLQ) and Lineage DAG.

```
       +-------------------------------------------------------------+
       |                  AGENT EXECUTION LOOP                       |
       |  Health Check / Invariant / Nociception / Divergence Metric  |
       +-------------------------------------------------------------+
                                      |
                     [Threshold Exceeded / Death Trigger]
                                      v
       +-------------------------------------------------------------+
       |                   CASPASE SIGNALING CASCADE                 |
       |  - Initiator: Intrinsic (Mitochondrial) or Extrinsic (Fas)  |
       |  - Executioner: Halts tool dispatch, sets read-only mode    |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |             APOPTOTIC BLEBBING & COMPACTION                 |
       |  - Episodic memory pruning & semantic distillation          |
       |  - Extract key causal failure proofs & discard toxic tokens |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |             RESOURCE RECLAMATION & LOCK RELEASE             |
       |  - Release file handles, API sockets, and token leases      |
       |  - Free orchestrator worker slots                           |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |             POST-MORTEM ATTESTATION & DLQ LOGGING           |
       |  - Write PostMortemAttestation to Lineage DAG               |
       |  - Forward forensic autopsy to Supervisor / DLQ             |
       +-------------------------------------------------------------+
```

---

## 2. Trigger Conditions & Pathways

GenOS distinguishes between two primary apoptotic signaling pathways:

### 2.1 Intrinsic Pathway (Agent Self-Nociception)
The agent autonomously monitors its own internal health metrics and triggers self-termination upon detecting:
- **Semantic Divergence Score ($D_{sem} > \theta_{div}$)**: Cosine distance between current belief state and primary objective exceeds tolerance threshold.
- **Infinite Reasoning / Action Loops**: Detected recurrence of identical tool call sequences with zero state progress ($N_{cycles} \ge 3$).
- **Irrecoverable Invariant Violations**: Internal validation failures on critical business logic or security assertions.
- **Context Pollution**: Context window approaching max capacity with low information density and high perplexity.

### 2.2 Extrinsic Pathway (Supervisor / Quorum Invalidation)
External signals dispatched by the Orchestrator, Parent Agent, or Swarm Consensus:
- **Fas/TNF-alpha Analog**: A high-priority supervisory kill command with cryptographic attestation.
- **Lineage Invalidation**: The parent trajectory branch was pruned or rolled back due to upstream conflict.
- **Token / Budget Exhaustion**: Strict upper bound enforcement across the agent colony.

---

## 3. The Caspase Signaling Protocol

The termination sequence maps directly to biological proteases (caspases):

| Biological Component | GenOS Equivalent | Function |
| :--- | :--- | :--- |
| **Death Receptor (FasR/TNFR)** | `ApoptosisReceiver` | External IPC channel listening for supervisory termination signals. |
| **Mitochondrial Cytochrome C** | `InternalNociceptor` | Internal health watchdog assessing memory drift and tool error rates. |
| **Initiator Caspases (8 & 9)** | `ApoptosisTrigger` | Validates termination criteria, acquires global timestamp, creates autopsy context. |
| **Executioner Caspases (3 & 7)** | `TerminationExecutor` | Revokes tool execution tokens, clears execution stack, invokes compaction routines. |
| **Macrophage Phagocytosis** | `Cleaner / DLQ Manager` | Ingests post-mortem summary, releases global scheduler slots, logs forensic lineage. |

---

## 4. Architecture & Data Structures

```rust
use serde::{Deserialize, Serialize};
use std::time::SystemTime;

/// Classification of the root cause triggering apoptosis.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApoptosisReason {
    SemanticDivergence { divergence_score: u32, threshold: u32 },
    ActionLoopDetected { repeated_action: String, count: u32 },
    InvariantViolation { rule_id: String, details: String },
    ExtrinsicSignal { issuer_id: String, reason: String },
    BudgetExhausted { consumed_tokens: u64, max_budget: u64 },
}

/// Compacted post-mortem summary preserved for lineage forensics.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PostMortemAttestation {
    pub agent_id: String,
    pub parent_id: Option<String>,
    pub timestamp: SystemTime,
    pub reason: ApoptosisReason,
    pub causal_chain_summary: String,
    pub compacted_memory_hash: String,
    pub recovered_tokens: u64,
}

/// Core Apoptosis Executor implementing safe shutdown.
pub struct ApoptosisController;

impl ApoptosisController {
    pub fn trigger_self_termination(
        agent_id: &str,
        reason: ApoptosisReason,
    ) -> PostMortemAttestation {
        // 1. Invalidate execution rights
        Self::revoke_execution_leases(agent_id);
        
        // 2. Compact working memory into dense forensic artifact
        let compacted_hash = Self::compact_memory(agent_id);
        
        // 3. Release locks and free allocated resources
        let freed_budget = Self::reclaim_resources(agent_id);
        
        // 4. Construct and emit post-mortem attestation
        PostMortemAttestation {
            agent_id: agent_id.to_string(),
            parent_id: None,
            timestamp: SystemTime::now(),
            reason,
            causal_chain_summary: "Deterministic shutdown sequence completed.".into(),
            compacted_memory_hash: compacted_hash,
            recovered_tokens: freed_budget,
        }
    }

    fn revoke_execution_leases(_agent_id: &str) {}
    fn compact_memory(_agent_id: &str) -> String { "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".into() }
    fn reclaim_resources(_agent_id: &str) -> u64 { 15200 }
}
```

---

## 5. Memory Compaction & Blebbing

When an agent enters apoptosis, its full conversation context (which may span hundreds of thousands of tokens of noisy tool executions, error stack traces, and exploratory attempts) must **not** be indiscriminately propagated to downstream agents or dumped raw to disk.

### 5.1 Semantic Distillation Routine
1. **Error Extraction**: Isolates the exact counterfactual hypothesis or tool parameters that led to the fault.
2. **Noise Pruning**: Strips intermediate conversational scaffolding, verbose logs, and failed retries.
3. **Experience Distillation**: Formats a 3-sentence actionable lesson for the global collective experience store (`genos_record_experience`).
4. **Digest Hashing**: Hashes the distilled granule and attaches it to the lineage graph for auditability.

---

## 6. Integration with MCP Tools & GenOS Runtime

GenOS exposes the apoptosis mechanism to agents and supervisors via the `genos_resilience_apoptosis` MCP tool:

```json
{
  "name": "genos_resilience_apoptosis",
  "description": "Trigger programmed agent termination, memory compaction, and resource cleanup.",
  "parameters": {
    "agent_id": "worker_03_subtask_9",
    "reason_type": "semantic_divergence",
    "details": "Divergence score 0.88 exceeded threshold 0.75 during AST refactoring"
  }
}
```

### CLI Command
```bash
genos resilience apoptosis --agent-id "worker_03_subtask_9"
```

---

## 7. Failure Recovery & Orphan Prevention

- **Supervisor Auto-Replacement**: When an apoptosis attestation is posted to the event bus, the Orchestrator evaluates whether to spawn a fresh, non-corrupted clone from the last valid checkpoint or reassign the subtask to another agent caste.
- **No Orphan Left Behind**: The Apoptosis Controller walks the dependency subtree of the dying agent and propagates cascade termination signals to any spawned child sub-agents, preventing zombie processes from leaking token budgets.
