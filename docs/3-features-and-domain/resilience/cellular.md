# Cellular Resilience: Eukaryotic Sandboxing, Nociception & Homeostatic Regulation

## 1. Overview & Biological Analogy

In eukaryotic biology, cellular viability is not maintained through the impossible guarantee of zero internal damage. Instead, cells maintain dynamic structural integrity (**homeostasis**) through four fundamental biomimetic mechanisms:
1. **Selective Semi-Permeable Membranes**: Strict filtration of incoming nutrients and outgoing signaling molecules.
2. **Organelle Compartmentalization**: Chemical and metabolic isolation ensuring local reactions do not spill toxic byproducts into the cytoplasm.
3. **Nociception & Molecular Stress Sensing**: Early biochemical alarms (kinases, reactive oxygen species detectors) measuring damage before systemic failure.
4. **Programmed Self-Regulation & Apoptosis**: Controlled degradation or suicide of malfunctioning cells to protect the surrounding tissue.

In **GenOS**, every autonomous agent operates as an isolated **Cell**. The cellular resilience architecture guarantees that memory leaks, unhandled panics, infinite hallucination loops, or poisoned inputs remain strictly contained within the originating execution cell without compromising the orchestrator or adjacent workers.

```
       +-------------------------------------------------------------+
       |                  CELLULAR MEMBRANE FILTER                   |
       |  - Selective Input/Output Validation & Schema Attestation   |
       +-------------------------------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
  +-------------------------------+         +-------------------------------+
  |        CODIT SANDBOX          |         |      NOCICEPTIVE SENSORS      |
  |  - catch_unwind panic guard   |         |  - Sliding error rate E_rate  |
  |  - Memory & thread boundary   |         |  - Semantic drift D_sem       |
  +-------------------------------+         +-------------------------------+
         |                                                         |
         +----------------------------+----------------------------+
                                      |
                                      v
         +---------------------------------------------------------+
         |              HOMEOSTATIC EVALUATOR & IDS                |
         |  - Compute Homeostatic Index H_cell                     |
         |  - If Toxic: Quarantine payload to Dead Letter Queue    |
         |  - If H_cell < 0.40: Trigger Apoptotic Dismantling      |
         +---------------------------------------------------------+
```

---

## 2. The Four Pillars of Cellular Resilience

### 2.1 CODIT Sandboxing (Containment Of Defective Isolated Tasks)
CODIT encapsulates each agent task within a strict execution boundary:
- **Panic Confinement**: Rust runtime panics and thread unwinds are trapped via `std::panic::catch_unwind`, converting fatal crashes into structured diagnostic errors.
- **Resource Clamping**: Strict allocation limits on execution time, memory footprint, and token burn rate.
- **Descriptor Containment**: Filesystem and network mutations are mediated via virtualized workspace descriptors.

### 2.2 Nociception (Early Pain & Stress Sensing)
Nociception quantifies execution distress continuously before catastrophic failure occurs:
- **Sliding Error Rate ($E_{rate}$)**: Fraction of failed tool executions across the last $N$ steps.
- **Observed Latency Ratio ($L_{obs} / L_{max}$)**: Drift against baseline latency profiles.
- **Semantic Divergence ($D_{sem}$)**: Cosine distance between current belief state embeddings and task goal embeddings.

### 2.3 Homeostatic Regulation & Apoptosis Triggering
Homeostasis continuously adjusts the operational state of the agent cell, shedding background load when degraded and executing clean shutdown (apoptosis) if unrecoverable.

### 2.4 Immune Defense System (IDS) & Dead Letter Queue (DLQ)
- **IDS Filter**: Scans incoming messages and tool returns for prompt injections, corrupted schemas, and adversarial loops.
- **DLQ Quarantining**: Malicious or unparseable payloads are isolated in an encrypted quarantine buffer for post-mortem forensics without blocking agent processing.

---

## 3. Mathematical Homeostasis Formulation

The viability and health status of an agent cell is continuously scored by the Homeostatic Index $H_{cell} \in [0.0, 1.0]$:

$$H_{cell} = 1.0 - \left( w_1 \cdot E_{rate} + w_2 \cdot \min\left(1.0, \frac{L_{obs}}{L_{max}}\right) + w_3 \cdot D_{sem} \right)$$

Where:
- $E_{rate} = \frac{1}{N} \sum_{i=1}^{N} \mathbb{I}(\text{Step}_i == \text{FAILED})$, with weight $w_1 = 0.40$.
- $L_{obs} / L_{max}$ is the normalized latency ratio, with weight $w_2 = 0.25$.
- $D_{sem} = 1 - \frac{\mathbf{v}_{goal} \cdot \mathbf{v}_{current}}{\|\mathbf{v}_{goal}\| \|\mathbf{v}_{current}\|}$, with weight $w_3 = 0.35$.
- Constraints: $w_1 + w_2 + w_3 = 1.0$.

### Health State Transitions

| Health Range | State Category | Action Taken |
| :--- | :--- | :--- |
| **$H_{cell} \ge 0.70$** | **Nominal (Healthy)** | Unrestricted execution at full concurrency. |
| **$0.40 \le H_{cell} < 0.70$** | **Degraded (Nociceptive Warning)** | Throttle execution rate, trigger Somatic Hypermutation, shed speculative tasks. |
| **$H_{cell} < 0.40$** | **Critical (Apoptosis Required)** | Immediate execution halt, memory compaction, and DLQ quarantine. |

---

## 4. Rust Architecture & Implementation

```rust
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum CellState {
    Nominal,
    Degraded(f32),
    Apoptotic,
}

pub struct NociceptiveMetrics {
    pub total_calls: u32,
    pub failed_calls: u32,
    pub cumulative_latency: Duration,
    pub max_latency: Duration,
    pub semantic_divergence: f32,
}

pub struct CellularAgent {
    pub id: String,
    pub state: CellState,
    pub metrics: NociceptiveMetrics,
    pub dlq: Vec<String>,
}

impl CellularAgent {
    pub fn new(id: &str, max_latency: Duration) -> Self {
        Self {
            id: id.to_string(),
            state: CellState::Nominal,
            metrics: NociceptiveMetrics {
                total_calls: 0,
                failed_calls: 0,
                cumulative_latency: Duration::ZERO,
                max_latency,
                semantic_divergence: 0.0,
            },
            dlq: Vec::new(),
        }
    }

    /// Executes task inside CODIT sandbox with panic isolation.
    pub fn execute_sandboxed<F, R>(&mut self, task: F) -> Result<R, String>
    where
        F: FnOnce() -> Result<R, String> + std::panic::UnwindSafe,
    {
        if self.state == CellState::Apoptotic {
            return Err("Execution rejected: Cell in apoptotic state.".into());
        }

        let start = Instant::now();
        self.metrics.total_calls += 1;

        let outcome = catch_unwind(AssertUnwindSafe(task));
        let duration = start.elapsed();
        self.metrics.cumulative_latency += duration;

        match outcome {
            Ok(Ok(value)) => {
                self.evaluate_homeostasis();
                Ok(value)
            }
            Ok(Err(err_msg)) => {
                self.metrics.failed_calls += 1;
                self.dlq.push(err_msg.clone());
                self.evaluate_homeostasis();
                Err(err_msg)
            }
            Err(_) => {
                self.metrics.failed_calls += 1;
                self.dlq.push("Critical panic unwound inside CODIT sandbox".into());
                self.trigger_apoptosis("Unhandled panic trapped");
                Err("Execution panic trapped and quarantined.".into())
            }
        }
    }

    /// Computes H_cell and transitions cell operational state.
    pub fn evaluate_homeostasis(&mut self) {
        if self.metrics.total_calls == 0 {
            return;
        }

        let e_rate = self.metrics.failed_calls as f32 / self.metrics.total_calls as f32;
        let avg_lat = self.metrics.cumulative_latency.as_secs_f32() / self.metrics.total_calls as f32;
        let lat_ratio = (avg_lat / self.metrics.max_latency.as_secs_f32()).min(1.0);
        let d_sem = self.metrics.semantic_divergence.clamp(0.0, 1.0);

        let h_cell = 1.0 - (0.40 * e_rate + 0.25 * lat_ratio + 0.35 * d_sem);

        if h_cell < 0.40 {
            self.trigger_apoptosis("Homeostatic index breached critical threshold (< 0.40)");
        } else if h_cell < 0.70 {
            self.state = CellState::Degraded(h_cell);
        } else {
            self.state = CellState::Nominal;
        }
    }

    pub fn trigger_apoptosis(&mut self, reason: &str) {
        self.state = CellState::Apoptotic;
        eprintln!("[CELLULAR-APOPTOSIS] Agent {}: {}", self.id, reason);
    }
}
```

---

## 5. Dead Letter Queue & Forensic Autopsy

When an operation triggers an error or panic inside the CODIT sandbox, the payload and execution context are quarantined into the DLQ:

```json
{
  "dlq_entry_id": "dlq_99a8b7c6",
  "cell_id": "worker_parser_subtask_3",
  "timestamp": "2026-08-21T08:00:00Z",
  "failure_kind": "PanicUnwind",
  "payload_snippet": "ast_parse_symbol(Token::EOF)",
  "homeostatic_index": 0.32,
  "quarantine_status": "ISOLATED"
}
```

---

## 6. Operational Invariants & Resilience Guarantees

- **Zero Panic Leakage**: No unhandled panic in an agent thread can terminate the parent orchestrator process.
- **Budget Preservation**: Nociceptive alerts trigger early backoff, preventing token budget drain on degraded trajectories.
- **Forensic Traceability**: All quarantined failures maintain immutable records in the DLQ for offline causal analysis.
