# Somatic Hypermutation: Stress-Induced Exploration & Adaptive Fuzzing

## 1. Overview & Biological Analogy

In the adaptive immune system, **Somatic Hypermutation (SHM)** is a programmed cellular mechanism whereby B-lymphocytes intentionally introduce point mutations into the variable immunoglobulin coding sequences at rates up to $10^6$ times higher than the baseline genomic mutation rate. Orchestrated by the enzyme **Activation-Induced Cytidine Deaminase (AID)**, this localized genetic turbulence enables rapid diversification of antibody binding sites, followed by rigorous selection in the germinal center (**Affinity Maturation**) to generate ultra-high-affinity neutralizing antibodies.

Within **GenOS**, Somatic Hypermutation serves as an active cognitive escape mechanism for autonomous agents trapped in reasoning deadlocks, deterministic local minima, or cyclic error loops. When an agent experiences repeated execution failures—such as persistent compiler errors, invariant violations, or stagnant refactoring trajectories—GenOS suppresses conservative inference and engages stress-induced hypermutation to explore orthogonal hypotheses.

```
       +-------------------------------------------------------------+
       |               BASELINE AGENT INFERENCE LOOP                 |
       |  Conservative Temperature (tau=0.2), Strict Top-P (p=0.90)  |
       +-------------------------------------------------------------+
                                      |
                     [Repeated Tool Failure / Zero Progress]
                                      v
       +-------------------------------------------------------------+
       |             STRESS NOCICEPTOR & AID CONTROLLER              |
       |  1. Compute Stagnation Index I_stag and Stress Metric S(t)  |
       |  2. Trip AID Activation Threshold (Stress >= theta_shm)     |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |             EXPLORATION PARAMETER AMPLIFICATION             |
       |  - Temperature Boost: tau(t) = tau_0 * (1 + alpha * S(t))   |
       |  - Top-P Widening:    p(t)   = min(1.0, p_0 + kappa * S(t)) |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |             GENETIC PROMPT MUTATION OPERONS                 |
       |  - Point Mutation: Lexical substitution & semantic shift    |
       |  - Frame-Shift: Reorder premise vs objective constraints    |
       |  - Heuristic Inversion: Inject counter-intuitive axioms     |
       |  - Tool Permutation: Force alternative execution strategies |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |             SANDBOXED CLONAL AFFINITY TESTING               |
       |  - Dispatch N mutated clones in parallel CODIT sandboxes    |
       |  - Measure candidate fitness against deterministic checks   |
       +-------------------------------------------------------------+
                                      |
                      +---------------+---------------+
                      |                               |
             [Fitness < Threshold]           [Fitness >= Threshold]
                      |                               |
                      v                               v
             [Lethal / Pruned]              [Clonal Selection]
             Discard branch state           Adopt branch into Lineage DAG
```

---

## 2. Mathematical Modeling of Exploration Amplification

### 2.1 Dynamic Temperature Boosting
Let $\tau_0 \in (0, 1]$ represent the baseline inference temperature. Under environmental stress $\text{Stress}(t) \in [0, 1]$, the boosted temperature $\tau(t)$ is formulated as:

$$\tau(t) = \min\left(\tau_{max}, \; \tau_0 \cdot \left(1 + \alpha \cdot \text{Stress}(t)\right)\right)$$

Where:
- $\tau_{max} = 1.25$ prevents chaotic token entropy collapse into gibberish.
- $\alpha \in [0.5, 2.0]$ governs exploration amplification sensitivity (default: $\alpha = 1.2$).

### 2.2 Stress Metric Formulation
Agent stress accumulates as a saturating hyperbolic tangent of consecutive failures $K_{consec}$ and semantic progress stagnation:

$$\text{Stress}(t) = \tanh\left(\beta \cdot K_{consec}(t) + \lambda \cdot \left(1 - \Pi(t)\right)\right)$$

Where:
- $\beta = 0.35$ defines the failure accumulation rate.
- $\Pi(t) \in [0, 1]$ represents the normalized progress metric (AST node resolution rate or passing test ratio).
- $\lambda = 0.50$ weights domain stagnation.

### 2.3 Top-P Dynamic Widening & Stagnation Index
Sampling nucleus width $p(t)$ widens to admit low-probability, out-of-distribution reasoning tokens:

$$p(t) = \min\left(1.0, \; p_0 + \kappa \cdot \text{Stress}(t)\right)$$

Stagnation across a sliding window of $W$ actions is quantified by the Stagnation Index $I_{stag}$:

$$I_{stag}(W) = \frac{1}{W} \sum_{i=1}^{W} \mathbb{I}\left(\text{Hash}(\text{Action}_i) == \text{Hash}(\text{Action}_{i-1})\right)$$

---

## 3. Cognitive Dead-End Escape & Genetic Prompt Operons

When standard prompting hits a local minimum, GenOS applies genetic operators to prompt genomes:

| Genetic Operator | Biological Analogy | Action on Agent Prompt Genome |
| :--- | :--- | :--- |
| **Point Mutation** | Single-base deamination (AID) | Replaces key verbs and constraints with functional synonyms to shift token attention weights. |
| **Frame-Shift** | Insertion / Deletion shift | Reorders task constraints, putting end-conditions ahead of procedural assumptions. |
| **Heuristic Inversion** | Gene inversion | Injects antithetical axioms (e.g., *"Assume standard library API is unavailable; build from minimal primitives"*). |
| **Context Scrambling** | Meiotic crossing-over | Prunes stagnant scratchpad tokens and reshuffles hypothesis rankings in working memory. |
| **Tool Permutation** | Metabolic pathway bypass | Blacklists the failing tool and forces the agent to use alternative bash/code introspection tools. |

---

## 4. Rust Architecture & Implementation

```rust
use serde::{Deserialize, Serialize};

/// Operon mutation strategies for prompt and policy perturbation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MutationOperon {
    PointMutation,
    FrameShift,
    HeuristicInversion,
    ToolPermutation,
}

/// Configuration parameters for Somatic Hypermutation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HypermutationConfig {
    pub base_temperature: f32,
    pub max_temperature: f32,
    pub amplification_alpha: f32,
    pub failure_decay_beta: f32,
}

impl Default for HypermutationConfig {
    fn default() -> Self {
        Self {
            base_temperature: 0.2,
            max_temperature: 1.25,
            amplification_alpha: 1.2,
            failure_decay_beta: 0.35,
        }
    }
}

/// Engine managing stress calculation and prompt mutation.
pub struct SomaticHypermutator {
    config: HypermutationConfig,
}

impl SomaticHypermutator {
    pub fn new(config: HypermutationConfig) -> Self {
        Self { config }
    }

    /// Calculates the dynamic inference temperature under stress.
    pub fn compute_temperature(&self, consecutive_fails: u32, progress: f32) -> f32 {
        let stress = self.compute_stress(consecutive_fails, progress);
        let boosted = self.config.base_temperature * (1.0 + self.config.amplification_alpha * stress);
        boosted.min(self.config.max_temperature)
    }

    /// Computes normalized stress metric in [0.0, 1.0].
    pub fn compute_stress(&self, consecutive_fails: u32, progress: f32) -> f32 {
        let raw = self.config.failure_decay_beta * (consecutive_fails as f32) + 0.5 * (1.0 - progress.clamp(0.0, 1.0));
        raw.tanh().clamp(0.0, 1.0)
    }

    /// Mutates an input prompt according to the selected genetic operon.
    pub fn apply_operon(&self, operon: MutationOperon, prompt: &str) -> String {
        match operon {
            MutationOperon::PointMutation => {
                format!("[MUTATION::SYNONYM_REPHRASE]\n{}", prompt)
            }
            MutationOperon::FrameShift => {
                format!("[MUTATION::INVERT_CONSTRAINT_ORDER]\nPrioritize post-conditions.\n{}", prompt)
            }
            MutationOperon::HeuristicInversion => {
                format!("[MUTATION::EXPLORE_CONTRARIAN_HYPOTHESIS]\nDiscard existing assumptions.\n{}", prompt)
            }
            MutationOperon::ToolPermutation => {
                format!("[MUTATION::ALTERNATIVE_TOOL_STRATEGY]\nBypass default toolchain.\n{}", prompt)
            }
        }
    }
}
```

---

## 5. Affinity Maturation Protocol

Mutated clones are not blindly accepted. Each candidate undergoes rigorous selection:

```
                      +-----------------------------+
                      |   Mutated Clone Spawned     |
                      +-----------------------------+
                                     |
                                     v
                      +-----------------------------+
                      |  Isolated Sandbox Execution |
                      |    (Compiler & Test Run)    |
                      +-----------------------------+
                                     |
                                     v
                      +-----------------------------+
                      | Calculate Affinity Score:   |
                      | Affinity = exp(-gamma * E)  |
                      +-----------------------------+
                                     |
                    +----------------+----------------+
                    |                                 |
           [Affinity < Target]               [Affinity >= Target]
                    |                                 |
                    v                                 v
        [Apoptosis / Prune Clone]         [Commit to Lineage DAG]
```

1. **Sandboxed Evaluation**: Candidate executes in an isolated environment with zero side-effects.
2. **Affinity Metric**: Fitness evaluates compiler success ($\Delta_{comp}$), test coverage ($\Delta_{test}$), and invariant compliance.
3. **Lineage Commit**: Only mutant genomes exceeding parent affinity by threshold $\theta_{aff} \ge 0.15$ are retained.

---

## 6. MCP Tool Schema & CLI Usage

### 6.1 MCP Tool Declaration
```json
{
  "name": "genos_resilience_hypermutation",
  "description": "Trigger somatic hypermutation to boost exploration and escape reasoning local minima.",
  "parameters": {
    "type": "object",
    "properties": {
      "agent_id": {
        "type": "string",
        "description": "Identifier of the stalled agent"
      },
      "consecutive_failures": {
        "type": "integer",
        "description": "Number of consecutive failed iterations"
      },
      "operon": {
        "type": "string",
        "enum": ["PointMutation", "FrameShift", "HeuristicInversion", "ToolPermutation"]
      }
    },
    "required": ["agent_id", "consecutive_failures"]
  }
}
```

### 6.2 CLI Invocations
```bash
# Evaluate stress and execute hypermutation on a stalled subtask
genos resilience hypermutation --agent-id "worker_ast_rewrite" --failures 4 --operon "HeuristicInversion"
```

---

## 7. Safety Invariants & Operational Bounds

- **Bounded Temperature Cap**: Temperature is strictly capped at $\tau_{max} = 1.25$ to prevent model delirium.
- **Max Mutation Depth**: An agent lineage may undergo at most $D_{max} = 5$ consecutive hypermutations before triggering Apoptosis.
- **Epigenetic Marker Storage**: Mutants that successfully escape local minima commit their prompt delta to the Epigenetic Memory bank, immunizing future clones against identical deadlocks.
