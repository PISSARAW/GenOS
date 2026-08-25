# Viral Dynamics: Lytic Bursts, Prophage Dormancy, Transduction & Quasispecies

## 1. Overview & Biological Analogy

Viruses are obligate intracellular parasites with minimal genomes that hijack
host machinery to replicate. Their defining behaviors are not only hostile:
they are among evolution's most effective mechanisms for exploration,
dormancy, and horizontal information transfer. Three cycles matter here:

1. **Lytic cycle**: the virus replicates explosively inside the host cell,
   then lyses it, releasing a burst of progeny. Selection acts on the *burst*,
   not on individual virions.
2. **Lysogenic cycle**: the virus integrates its genome into the host genome
   as a **prophage**. It replicates passively, silently inherited across host
   divisions, until an induction signal (stress, DNA damage) triggers excision
   and entry into the lytic cycle.
3. **Transduction**: during replication, viruses accidentally package host DNA
   into capsids and deliver it to the next infected cell — the dominant engine
   of **horizontal gene transfer** (HGT) in bacteria.

In **GenOS**, these cycles become controlled mechanisms for exploring
hypothesis space, storing dormant capabilities, and sharing successful
strategies *across unrelated lineages* — something vertical inheritance
(parent → child genomes) cannot do. Crucially, every mechanism below respects
the existing evidence contract: nothing enters a lineage without passing the
sandboxed evaluation and explicit review promotion pipeline defined in
[phenotype.md](../phenotype.md).

```
     +-------------------------------------------------------------+
     |                  DONOR LINEAGE UNDER STRESS                 |
     |     Stress(t) >= theta_induction  (see hypermutation.md)    |
     +-------------------------------------------------------------+
                                     |
              +----------------------+----------------------+
              |                                             |
              v                                             v
     +---------------------+                      +--------------------+
     |   LYTIC BURST       |                      |  LYSOGENIC DORMANCY|
     |  Spawn N divergent  |                      |  Integrate skill   |
     |  clones in isolated |                      |  cassette at       |
     |  worlds; evaluate;  |                      |  PROPHAGE LOCUS;   |
     |  burst-harvest;     |                      |  passively inherit |
     |  prune hosts        |                      |  across forks      |
     +---------------------+                      +--------------------+
              |                                             |
              v                                             v
     +-------------------------------------------------------------+
     |                TRANSDUCTION CAPSULE ASSEMBLY                |
     |  Package winning delta-cassettes (prompt fragments, tool    |
     |  strategies, epigenetic markers) into signed capsules       |
     +-------------------------------------------------------------+
                                     |
                                     v
     +-------------------------------------------------------------+
     |        INJECTION INTO UNRELATED RECIPIENT LINEAGE           |
     |  Superinfection exclusion -> quarantine -> review gate      |
     |  -> sandboxed evaluation -> lineage commit (INV-008)        |
     +-------------------------------------------------------------+
```

## 2. The Four Mechanisms

| Mechanism | Biological Analogy | GenOS Behavior |
| :--- | :--- | :--- |
| **Lytic Burst** | Viral replication & cell lysis | On stagnation, fork N divergent clones into isolated worlds (`genos-world`), evaluate all, harvest only evaluation artifacts, then deterministically terminate every clone (apoptosis). The *burst product*, not the clones, is what survives. |
| **Prophage Cassette** | Lysogenic integration | Successful escape strategies are compressed into immutable **skill cassettes** inserted at a dedicated `prophage_locus` of the child genome. They are inert: no behavioral change until the stress nociceptor fires again (induction). |
| **Transduction** | Phage-mediated HGT | Signed capsules containing winning deltas can be injected into *unrelated* lineages — reviewed horizontal transfer instead of unreviewed observation-driven mutation (which phenotype.md forbids). |
| **Superinfection Exclusion** | Phage immunity to re-infection | A lineage already carrying a semantically equivalent cassette rejects duplicate injection attempts, preventing bloat and prompt-injection-style amplification. |

### 2.1 Induction Semantics

A prophage cassette expresses only under stress, reusing the existing stress
metric $\text{Stress}(t)$ from [hypermutation.md](hypermutation.md):

$$\text{Express}(\mathcal{G}, t) \iff \text{Stress}(t) \ge \theta_{induction} \;\land\; \text{cassette affinity to failure mode} \ge \theta_{aff}$$

This keeps baseline inference conservative while making hard-won capabilities
available exactly when the situation that produced them recurs.

## 3. Mathematical Modeling

### 3.1 Quasispecies & the Error Threshold

Classical single-mutant search (one mutated clone at a time) ignores that
RNA viruses evolve as **mutant clouds** around a master sequence: selection
acts on the distribution, not individuals. During lytic bursts, GenOS samples
clones from a cloud centered on the stalled parent:

$$p(c_i) \propto \exp\left(-\frac{\|c_i - g_{master}\|^2}{2\sigma^2}\right), \quad \sigma = \sigma_0 \cdot (1 + \alpha \cdot \text{Stress}(t))$$

The quasispecies theorem imposes a hard bound: if the per-genome error rate
exceeds $1/L$ (with $L$ the effective information length), the population
loses the master sequence entirely (**error catastrophe**). The guard applies
to the *width of the mutant cloud*, not to its size — selection pressure
bounds how far clones may drift, while the operator chooses how many clones
to pay for:

$$u \cdot L < \ln\!\left(\frac{W_{max}}{W_{avg}}\right)
\;\implies\;
\sigma_{max} = \sqrt{\frac{\ln(W_{max}/W_{avg})}{L}}$$

Requested cloud widths beyond $\sigma_{max} are clamped; when $W_{max} =
W_{avg} (no fitness edge) no exploration is admissible at all.

### 3.2 Transduction Fidelity

A capsule $K$ is admissible for lineage $R$ only if projected fitness gain is
positive under the recipient's own evaluation suite:

$$\mathbb{E}_{R}[\Delta f(K)] > 0 \;\land\; \text{Affinity}(K, s) < \theta_{self} \;\; \forall s \in \mathcal{S}_{self}(R)$$

The second clause reuses the **negative selection** kernel from
[cyber_immune.md](cyber_immune.md): a capsule that resonates with the
recipient's self-corpus (its benign operational prompts) is rejected before
review, because such resonance is the signature of contamination, not skill.

## 4. Threat Model Extension: Latency & Antigenic Variation

Real viruses also define *adversarial* behaviors that GenOS must expect:

| Viral Strategy | Adversarial Agent Equivalent | Countermeasure |
| :--- | :--- | :--- |
| **Latency** (herpes: dormant, reactivating) | Injection payload parked in episodic memory or a workspace file, re-expressing sessions later | Periodic **provocation assays**: replay stress conditions over archived snapshots to flush latent payloads into detection |
| **Antigenic variation** (influenza drift) | Attack prompts paraphrased per attempt to evade hashed signatures | Detect on embedding affinity, not hashes; mature detectors via clonal selection |
| **Lysogenic hijack** | Malicious "skill cassettes" offered as helpful transduction gifts | All inbound capsules pass negative selection + human review; provenance hash mandatory (INV-008) |

Provocation assay scheduling follows viral induction kinetics: latency periods
are longest right after infection, so archives are scanned most densely in the
window immediately following any confirmed antigen event.

## 5. Rust Architecture & Implementation

```rust
use serde::{Deserialize, Serialize};

/// Immutable, signed unit of horizontally transferable capability.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TransductionCapsule {
    pub capsule_id: String,
    pub provenance_genome: String,
    pub payload_delta: String,
    pub failure_mode_signature: Vec<f32>,
    pub evaluation_proof_hash: String,
}

/// State of a cassette integrated at a genome's prophage locus.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CassetteState {
    /// Inert: inherited across forks, no behavioral effect.
    Dormant,
    /// Expressed under stress >= theta_induction.
    Induced,
    /// Rejected by superinfection exclusion.
    Excluded,
}

pub struct ViralDynamicsEngine {
    induction_threshold: f32,
    max_mutation_budget: u32,
}

impl ViralDynamicsEngine {
    pub fn new(induction_threshold: f32, max_mutation_budget: u32) -> Self {
        Self { induction_threshold, max_mutation_budget }
    }

    /// Lysogenic induction: activate dormant cassettes under stress.
    pub fn induce(&self, stress: f32, state: CassetteState) -> CassetteState {
        match state {
            CassetteState::Dormant if stress >= self.induction_threshold => CassetteState::Induced,
            other => other,
        }
    }

    /// Quasispecies error-threshold guard for a lytic burst.
    pub fn burst_budget(&self, info_length: f32, w_max: f32, w_avg: f32) -> u32 {
        let budget = ((w_max / w_avg).ln() / info_length).floor();
        (budget.max(1.0) as u32).min(self.max_mutation_budget)
    }

    /// Superinfection exclusion: refuse capsules redundant with resident ones.
    pub fn admits(
        &self,
        incoming: &TransductionCapsule,
        resident_signatures: &[Vec<f32>],
        gamma: f32,
        theta_exclusion: f32,
    ) -> bool {
        !resident_signatures.iter().any(|r| {
            let dist_sq: f32 = r.iter()
                .zip(incoming.failure_mode_signature.iter())
                .map(|(a, b)| (a - b).powi(2))
                .sum();
            (-gamma * dist_sq).exp() >= theta_exclusion
        })
    }
}
```

## 6. MCP Tool Schema & CLI Usage

### 6.1 MCP Tool Declaration
```json
{
  "name": "genos_resilience_viral_dynamics",
  "description": "Manage lysogenic skill cassettes, transduction capsules, and lytic bursts.",
  "parameters": {
    "type": "object",
    "properties": {
      "agent_id": { "type": "string" },
      "action": {
        "type": "string",
        "enum": ["LyticBurst", "IntegrateCassette", "InduceCassettes", "InjectCapsule", "RunProvocationAssay"]
      },
      "capsule_id": { "type": "string" }
    },
    "required": ["agent_id", "action"]
  }
}
```

### 6.2 CLI Invocations
```bash
# Harvest winners of a stalled branch into a transduction capsule
genos resilience transduce --from "worker_ast_rewrite" --to "worker_schema_fix" --capsule "cap_04f2"

# List and manually induce dormant cassettes on a stressed lineage
genos genome cassettes list --genome "g_9ab3"
genos genome cassettes induce --genome "g_9ab3" --stress 0.72
```

## 7. Safety Invariants & Operational Bounds

- **No Unreviewed Transduction**: every capsule crosses the same promotion
  pipeline as observation-driven mutations; transduction changes *who offers*
  the change, never whether it is reviewed.
- **Error Catastrophe Guard**: burst budgets are computed analytically from
  information length, never hand-tuned above the quasispecies bound.
- **Cassette Immutability**: integrated cassettes are content-addressed and
  append-only within the Merkle DAG; induction toggles expression state, not
  payload.
- **Bounded Dormancy**: a lineage may carry at most $C_{max}$ dormant cassettes
  before forced consolidation, preventing prophage bloat.

## 8. Implementation Status

Implemented in `crates/genos-core/src/resilience/viral_dynamics.rs` and wired
to the CLI (`genos resilience viral-status | burst | cassette-integrate |
cassette-induce | transduce`) with persistence under `.genos/viral/`. Protocol
specs: `resilience_lytic_burst`, `resilience_transduce`.
