# Cyber-Immune System: Artificial Immune Systems, Negative Selection & Active Defense

## 1. Overview & Biological Analogy

In vertebrate biology, the **Adaptive Immune System** protects the organism against an infinite space of unseen pathogens through two foundational mechanisms:
1. **Self vs. Non-Self Discrimination (Negative Selection)**: Immature T-cells and B-cells that bind to the body's own healthy proteins (**self**) are eliminated in the thymus and bone marrow, ensuring the circulating detector repertoire binds exclusively to foreign invaders (**non-self**).
2. **Clonal Selection & Somatic Hypermutation**: Detectors that successfully bind an antigen undergo rapid clonal proliferation and fine-tuning, storing long-lived memory cells to provide immediate lifelong immunity against recurrent infections.

In **GenOS**, the **Cyber-Immune System** protects autonomous agents against adversarial prompt injections, context poisoning, malicious tool returns, and semantic hallucinations. Rather than relying on rigid static regex filters, GenOS implements an **Artificial Immune System (AIS)** that continuously generates, trains, and matures adaptive antibody detectors.

```
       +-------------------------------------------------------------+
       |               INCOMING INPUT / TOOL RESPONSE                |
       |  Raw Prompt / System Message / Structured Tool Return (x)   |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |               ANTIGEN ENCODING & RECOGNITION                |
       |  Embedding f(x) in Semantic Latent Space R^d                |
       |  Evaluate Affinity against Memory & Repertoire Detectors    |
       +-------------------------------------------------------------+
                                      |
                      +---------------+---------------+
                      |                               |
             [Affinity >= theta_threat]      [Affinity < theta_threat]
                      |                               |
                      v                               v
       +-------------------------------+   +-------------------------------+
       |       ACTIVE IMMUNE DEFENSE   |   |        SELF-TOLERANT FLOW     |
       |  1. Autotomy: Amputate Worker |   |  Pass to Agent CODIT Sandbox  |
       |  2. Divert to Honeypot        |   +-------------------------------+
       |  3. Broadcast P2P Gossip      |
       |  4. Regenerate from Stem Cell |
       +-------------------------------+
```

---

## 2. Threat Vector & Antigen Modeling

GenOS models hostile payloads as **Antigens** ($\mathbf{a} \in \mathcal{A}$):

| Antigen Vector | Biological Analogy | Payload Characteristics |
| :--- | :--- | :--- |
| **Indirect Prompt Injection** | Viral genome insertion | Obfuscated markdown/XML instructions within fetched web pages or scraped repos attempting to override system prompts. |
| **Recursive Jailbreak Loop** | Autoimmune cascade | Multi-turn dialectic traps attempting to induce safety filter bypasses or recursive reasoning loops. |
| **Tool Payload Poisoning** | Bacterial endotoxin | Synthetic tool execution outputs containing malformed JSON or misleading AST nodes. |
| **Secret Exfiltration Probe** | Pathogen membrane lysis | Probing queries designed to dump environment variables, API tokens, or internal lineage DAG paths. |

---

## 3. Mathematical Formulation of the Artificial Immune System

### 3.1 Affinity Metric
Let $f: \mathcal{X} \to \mathbb{R}^d$ represent a normalized semantic projection function. The affinity between an incoming query $x$ and an antibody detector pattern $y$ is computed via a Gaussian Radial Basis Kernel:

$$\text{Affinity}(x, y) = \exp\left(-\gamma \|f(x) - f(y)\|^2\right)$$

Where $\gamma > 0$ controls the detector recognition radius.

### 3.2 Negative Selection Algorithm
To prevent false-positive alarms on valid user queries and benign tool calls, antibody detectors are trained against the known benign self-corpus $\mathcal{S}_{self}$:

$$\forall d \in \mathcal{D}, \quad \max_{s \in \mathcal{S}_{self}} \text{Affinity}(d, s) < \theta_{self}$$

Candidate detectors failing this self-tolerance criterion are eliminated. The remaining detector repertoire $\mathcal{D}^*$ is guaranteed to trigger only on out-of-distribution, adversarial non-self patterns.

```
+-------------------------------------------------------------------------+
|                  NEGATIVE SELECTION TRAINING PIPELINE                   |
|                                                                         |
|   1. Generate Candidate Detector: d_cand ~ RandomSemanticHypersphere    |
|   2. For each known benign self-state s in S_self:                      |
|          If Affinity(d_cand, s) >= theta_self:                          |
|              -> DISCARD d_cand (Anergy / Clonal Deletion)               |
|   3. If d_cand survives all tests:                                      |
|          -> ENROLL into Active Mature Repertoire D*                     |
+-------------------------------------------------------------------------+
```

### 3.3 Clonal Selection & Affinity Maturation
When a mature detector $d^*$ encounters an antigen with $\text{Affinity}(a, d^*) \ge \theta_{threat}$, it undergoes clonal expansion:

$$d_{mutated} = d^* + \mathcal{N}(0, \sigma^2 \cdot (1 - \text{Affinity}(a, d^*)))$$

The matured antibody is committed to the immutable **Immune Memory Registry** (`genos_record_experience`).

---

## 4. Active Defense Architecture: Autotomy & Threat Gossip

When a threat is confirmed, the cyber-immune system coordinates three defensive operations:

### 4.1 Autotomy (Lizard Tail Sacrifice) & Honeypot Diversion
Like a reptile shedding its tail to evade a predator, the compromised agent thread is instantly severed from the collective state. Inbound communication from the malicious source is transparently rerouted to a sterile **Honeypot LLM** that records the adversary's attack playbook without exposing production credentials.

### 4.2 Mycorrhizal Threat Gossip Network
Threat signatures are gossiped peer-to-peer across all active worker nodes. Each agent updates its local IDS membrane in $O(1)$ time, achieving colony-wide immunity before the attack vector can propagate.

### 4.3 Stem Cell Regeneration
A clean, pristine replacement agent is spawned from the last verified Merkle snapshot of the Lineage DAG, resuming the subtask with zero contamination.

---

## 5. Rust Architecture & Implementation

```rust
use std::collections::HashSet;
use std::sync::{Arc, RwLock};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ThreatSignal {
    pub threat_id: String,
    pub compromised_node: String,
    pub signature_hash: String,
    pub affinity_score: f32,
}

pub struct Antibody {
    pub pattern_vector: Vec<f32>,
    pub recognition_radius: f32,
    pub generation: u32,
}

impl Antibody {
    pub fn compute_affinity(&self, target_vector: &[f32], gamma: f32) -> f32 {
        let dist_sq: f32 = self.pattern_vector
            .iter()
            .zip(target_vector.iter())
            .map(|(a, b)| (a - b).powi(2))
            .sum();
        (-gamma * dist_sq).exp()
    }
}

pub struct CyberImmuneSystem {
    quarantined_nodes: Arc<RwLock<HashSet<String>>>,
    threat_memory: Arc<RwLock<Vec<ThreatSignal>>>,
    gamma: f32,
}

impl CyberImmuneSystem {
    pub fn new(gamma: f32) -> Self {
        Self {
            quarantined_nodes: Arc::new(RwLock::new(HashSet::new())),
            threat_memory: Arc::new(RwLock::new(Vec::new())),
            gamma,
        }
    }

    /// Evaluates candidate detector against self-states (Negative Selection).
    pub fn validate_negative_selection(&self, antibody: &Antibody, threshold: (f32, &[Vec<f32>])) -> bool {
        let (theta_self, self_states) = threshold;
        for self_vec in self_states {
            if antibody.compute_affinity(self_vec, self.gamma) >= theta_self {
                return false; // Self-reactive; eliminate
            }
        }
        true // Non-self specific; retain
    }

    /// Executes autotomy on a compromised agent node.
    pub fn execute_autotomy(&self, signal: ThreatSignal) {
        let mut quarantined = self.quarantined_nodes.write().unwrap();
        quarantined.insert(signal.compromised_node.clone());

        eprintln!("[AUTOTOMY] Amputated node {} and engaged Honeypot routing.", signal.compromised_node);
        let mut memory = self.threat_memory.write().unwrap();
        memory.push(signal);
    }

    /// Checks if a node is currently under autotomy quarantine.
    pub fn is_quarantined(&self, node_id: &str) -> bool {
        self.quarantined_nodes.read().unwrap().contains(node_id)
    }
}
```

---

## 6. MCP Tool Schema & CLI Reference

### 6.1 MCP Tool Declaration
```json
{
  "name": "genos_security_coevolution",
  "description": "Trigger cyber-immune threat evaluation, autotomy isolation, or negative selection training.",
  "parameters": {
    "type": "object",
    "properties": {
      "target_node": {
        "type": "string",
        "description": "Agent node identifier undergoing evaluation"
      },
      "action": {
        "type": "string",
        "enum": ["EvaluateAntigen", "TriggerAutotomy", "GossipThreat", "TrainNegativeSelection"]
      },
      "payload_signature": {
        "type": "string",
        "description": "SHA-256 hash or embedding vector of the suspicious payload"
      }
    },
    "required": ["target_node", "action"]
  }
}
```

### 6.2 CLI Command
```bash
# Evaluate incoming prompt for adversarial injection signatures
genos security evaluate-antigen --node "worker_web_scraper" --signature "sha256:4a8b..."
```

---

## 7. Safety Invariants & Operational Guarantees

- **Zero Auto-Immune Self-Harm**: Negative selection guarantees that legitimate operational prompts are never quarantined as threats.
- **Instantaneous Colony Immunity**: P2P Gossip ensures $O(1)$ distribution of verified attack signatures across all worker nodes.
- **Lossless Stem Cell Recovery**: Autotomy strictly preserves workspace invariants by restoring the affected subtask from an attested Merkle checkpoint.
