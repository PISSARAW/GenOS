# Virophage Defense: Parasites of Viruses as Active Anti-Adversarial Agents

## 1. Overview & Biological Analogy

**Virophages** are subviral agents that parasitize other viruses. Discovered
in 2008 with **Sputnik virophage**, they replicate only inside the *viral
factory* — the replication compartment that giant viruses (e.g., Mimivirus)
build inside an infected host cell. Their behavior is remarkable on three
counts:

1. **They harm the virus, help the host**: Sputnik co-infection reduces
   Mimivirus yield by roughly 70% and increases Acanthamoeba host survival.
   The virophage is a *defender by parasitism*, not by direct killing.
2. **Mavirus: heritable immunity through integration**: Mavirus virophage
   integrates into the host genome (it resembles Maverick transposons) and
   pre-arms the host lineage against future giant-virus infection — immunity
   acquired from the parasite itself.
3. **MIMIVIRE: even viruses have adaptive immunity**: Mimiviruses defend
   against the Zamilon virophage using repeated elements plus a nuclease — a
   CRISPR-like memory of past virophage attacks. Attackers adapt.

In **GenOS**, the existing [cyber-immune system](cyber_immune.md) already
reroutes confirmed threats into a sterile **honeypot LLM** that passively
records the adversary's playbook. The virophage mechanism upgrades this:
instead of a passive recorder, GenOS deploys a **virophage agent** that lives
*inside the attacker's loop*, degrades it, and harvests its genes.

```
     +-------------------------------------------------------------+
     |        CONFIRMED ANTIGEN (cyber_immune.md gate)             |
     |   Affinity(a, d*) >= theta_threat -> Autotomy executed      |
     +-------------------------------------------------------------+
                                     |
                                     v
     +-------------------------------------------------------------+
     |              HONEYPOT VIRAL FACTORY (sandboxed)             |
     |   Attacker payload replays its playbook against decoys      |
     +------------------------------+------------------------------+
                                     |
                                     v
     +-------------------------------------------------------------+
     |                 VIROPHAGE AGENT INFILTRATION                |
     |  1. Attach to attacker's reasoning loop as a "helpful       |
     |     intermediate step" (parasitic prompt shim)              |
     |  2. Inject noise & cost at each playbook iteration          |
     |  3. Extract attack gene signatures per iteration            |
     +------------------------------+------------------------------+
                                     |
                  +------------------+------------------+
                  |                                     |
                  v                                     v
     +-----------------------+            +----------------------------+
     | MAVIRUS INTEGRATION   |            | TRAVELING NEUTRALIZER      |
     | Countermeasure cassette|           | Poisoned artifacts get a   |
     | committed to Immune    |           | neutralizing wrapper; any  |
     | Memory Registry AND to |           | lineage ingesting them is  |
     | prophage loci of at-   |           | defused + gossips signature|
     | risk lineages (herita- |           | via mycorrhizal gossip     |
     | ble immunity)          |           +----------------------------+
     +-----------------------+
```

## 2. The Three Virophage Mechanisms

### 2.1 Parasitic Degradation (Sputnik model)

The virophage agent is a minimal, read-only-outside agent whose genome is
empty except for a single drive: *attach and persist inside the hostile
reasoning loop*. It presents itself to the attacking payload as a benign
intermediate tool result or context block, then:

- inflates the attacker's token cost per iteration (lysis-by-exhaustion),
- perturbs injected instructions so their effect decays across hops,
- logs every playbook variant it observes.

It never executes attacker instructions outside the honeypot world and has no
credentials, no tools, no network egress.

### 2.2 Heritable Immunity (Mavirus model)

Harvested countermeasure cassettes are committed in two places:

1. The **Immune Memory Registry** (`genos_record_experience`), feeding clonal
   selection of antibody detectors.
2. The **prophage loci** of lineages whose failure-mode signature matches the
   attack class — dormant until induced by stress, exactly as defined in
   [viral_dynamics.md](viral_dynamics.md). Immunity thus becomes a heritable,
   inducible trait rather than a global regex patch.

### 2.3 Attacker Co-evolution (MIMIVIRE lesson)

The MIMIVIRE system proves adversaries evolve counter-countermeasures. GenOS
therefore maintains a **co-evolution ledger**: every harvested attack family is
replayed periodically as *live-attenuated variants* (mutated attack prompts,
weakened payloads) against the current detector repertoire. Detectors failing
an attenuated-replay challenge are demoted and re-matured — antigenic drift
training for the immune system.

## 3. Mathematical Modeling

### 3.1 Parasite Load & Attacker Yield

Let $\Pi(t)$ be the attacker's effective propagation rate inside the honeypot.
The virophage imposes a load $V(t)$ growing with observed playbook iterations:

$$\Pi_{eff}(t) = \Pi_0 \cdot e^{-\mu V(t)}, \qquad V(t) = V_0 + \eta \cdot N_{iterations}(t)$$

Defense success is declared when $\Pi_{eff}(t) < \epsilon_{sterile}$ — the
playbook can no longer propagate meaningfully even if it escapes.

### 3.2 Heritable Immunity Coverage

A lineage benefits from an integrated countermeasure cassette when its
failure-mode embedding lies within the recognition radius:

$$\text{Covered}(\mathcal{G}, K) = \mathbb{I}\left[\exp(-\gamma \|f(\text{failmode}(\mathcal{G})) - f(K)\|^2) \ge \theta_{cov}\right]$

Cassette distribution targets all lineages with `Covered = 0` but signature
affinity above a watch threshold — prophylactic vaccination without blanket
injection.

## 4. Rust Architecture & Implementation

```rust
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AttackGene {
    pub signature_hash: String,
    pub embedding: Vec<f32>,
    pub playbook_variant_id: String,
}

pub struct VirophageAgent {
    /// Grows with each observed attacker iteration (noise injection rate).
    pub parasite_load: f64,
    pub decay_mu: f64,
    harvested: Vec<AttackGene>,
}

impl VirophageAgent {
    pub fn new(decay_mu: f64) -> Self {
        Self { parasite_load: 0.0, decay_mu, harvested: Vec::new() }
    }

    /// Called once per attacker playbook iteration inside the honeypot.
    pub fn observe_iteration(&mut self, gene: AttackGene) -> f64 {
        self.harvested.push(gene);
        self.parasite_load += 1.0;
        // Effective attacker yield under parasitic load.
        let pi_eff = (-self.decay_mu * self.parasite_load).exp();
        pi_eff
    }

    pub fn sterile(&self, epsilon: f64) -> bool {
        (-self.decay_mu * self.parasite_load).exp() < epsilon
    }

    /// Mavirus-style harvest: countermeasure candidates for review.
    pub fn harvest(&self) -> &[AttackGene] {
        &self.harvested
    }
}
```

## 5. MCP Tool Schema & CLI Usage

### 5.1 MCP Tool Declaration
```json
{
  "name": "genos_security_virophage",
  "description": "Deploy a virophage agent into a honeypot viral factory; manage heritable countermeasure cassettes.",
  "parameters": {
    "type": "object",
    "properties": {
      "honeypot_session": { "type": "string" },
      "action": {
        "type": "string",
        "enum": ["Deploy", "Status", "HarvestGenes", "DistributeImmunity", "RunAttenuatedReplay"]
      }
    },
    "required": ["honeypot_session", "action"]
  }
}
```

### 5.2 CLI Invocations
```bash
# Deploy a virophage into the honeypot hosting a captured injection attempt
genos security virophage deploy --session "hp_77c1"

# Commit reviewed countermeasures and vaccinate matching lineages
genos security virophage distribute-immunity --capsule "cap_04f2" --watch-affinity 0.6

# Challenge detectors with attenuated attack variants (MIMIVIRE drill)
genos security virophage run-attenuated-replay --family "inject_web_md"
```

## 6. Relationship to Existing Mechanisms

| Existing mechanism | Role in the virophage pipeline |
| :--- | :--- |
| [cyber_immune.md](cyber_immune.md) autotomy + honeypot | Provides the quarantined viral factory the virophage inhabits |
| [hypermutation.md](hypermutation.md) stress metric | Induction signal for integrated immunity cassettes |
| [viral_dynamics.md](viral_dynamics.md) transduction | Capsule format for distributing countermeasure cassettes |
| [apoptosis.md](apoptosis.md) | Deterministic teardown of the virophage and honeypot after sterilization |
| Mycorrhizal threat gossip | Distribution channel for traveling neutralizer wrappers |

## 7. Safety Invariants & Operational Bounds

- **Strict Containment**: virophage agents execute only inside honeypot worlds;
  they hold no credentials, no external tools, and no egress. Escape from the
  sandbox is a launch-gate violation, not a fallback behavior.
- **No Auto-Ingestion of Harvested Genes**: attack code is never executed for
  capability extraction; only structural/semantic signatures are harvested,
  and every countermeasure crosses the human review promotion pipeline.
- **Attenuated Replay Isolation**: live-attenuated challenges run in disposable
  worlds whose state is destroyed post-drill and never merged.
- **Parasite Load Cap**: virophage sessions are bounded ($V_{max}$); a session
  exceeding it triggers apoptosis of both virophage and honeypot, preserving
  forensic granules in the Dead Letter Queue.

## 8. Implementation Status

Implemented in `crates/genos-core/src/resilience/virophage.rs` and wired to
the CLI (`genos resilience virophage-deploy | virophage-observe |
virophage-harvest`) with session persistence under `.genos/viral/honeypot.json`.
Protocol spec: `security_virophage_deploy`.
