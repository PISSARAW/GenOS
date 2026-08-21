# Genotype vs. Phenotype & Behavioral Divergence

GenOS introduces an evolutionary biology framework to autonomous AI systems. A central architectural distinction is maintained between the **Genotype** (the declared, versioned hereditary blueprint $\mathcal{G}$) and the **Phenotype** (the empirical, observed behavioral profile $\mathcal{P}$ exhibited during execution).

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                         GenOS Genetic Expression & Drift Pipeline                        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│         ┌───────────────────────┐                                                        │
│         │   Genotype G          │ (Declared Chromosomes, Drives, Policies)               │
│         └───────────┬───────────┘                                                        │
│                     │                                                                    │
│                     │ Expression Function: Φ(G, M, W, H)                                 │
│                     ▼                                                                    │
│         ┌───────────────────────┐                                                        │
│         │   Phenotype P         │ (Observed Metrics: Hallucination Rate,                 │
│         └───────────┬───────────┘  Tool Stagnation, Latency Distributions, D_sem)        │
│                     │                                                                    │
│                     │ Divergence Evaluation vs Genomic Baseline                          │
│                     ▼                                                                    │
│         ┌───────────────────────┐                                                        │
│         │   Divergence Report   │ ──► [Drift Δ > Tolerance?]                             │
│         └───────────┬───────────┘             │                                          │
│                     │                         │ Statistically Significant (p < 0.01)     │
│                     │                         ▼                                          │
│                     │          ┌─────────────────────────────┐                           │
│                     │          │ Inferred Trait Claim (QTL)  │                           │
│                     │          └──────────────┬──────────────┘                           │
│                     │                         │                                          │
│                     │                         │ Explicit Promotion Gate (`promote-trait`)│
│                     │                         ▼                                          │
│                     └─────────────────► Mutated Genome G'                                │
│                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Formal Theoretical Expression Framework

Let the realization of an agent's execution trajectory be governed by the expression function $\Phi$:

$$\Phi: \mathcal{G} \times \mathcal{M} \times \mathcal{W} \times \mathcal{H} \longrightarrow \mathcal{P} \times \mathcal{S}$$

Where:
- $\mathcal{G} \in \mathbb{G}$: **Agent Genotype** (immutable chromosome arrays, locus alleles, cognitive drive priors).
- $\mathcal{M} \in \mathbb{M}$: **Model Provider & Weights** (e.g., Claude 3.5 Sonnet, GPT-4o, Local Llama 3 via llama.cpp).
- $\mathcal{W} \in \mathbb{W}$: **World Substrate** (host filesystem, compiler toolchains, network accessibility).
- $\mathcal{H} \in \mathbb{H}$: **Historical Trajectory** (accumulated event sequence, context window state).
- $\mathcal{P} \in \mathbb{P}$: **Empirical Phenotype** (measured statistical behavior across task episodes).
- $\mathcal{S} \in \mathbb{S}$: **Internal Cognitive State** (working memory, belief graph, active goals).

### The Invariant of Non-Identity ($\mathcal{G} \ne \mathcal{P}$)
A declared genomic allele (e.g. `verification_threshold = 0.90`) does not guarantee identical empirical behavior under model stochasticity $\mathcal{M}$ or adversarial environments $\mathcal{W}$. The phenotype $\mathcal{P}$ represents the *actual observed realization* of genetic instructions in a concrete environment.

---

## 2. Quantitative Trait Loci (QTL) & Chromosomal Architecture

GenOS organizes genetic information into structured chromosomes and loci, regulated by epigenetic dampening markers:

```rust
pub struct Chromosome {
    pub name: String,
    pub loci: Vec<Locus>,
}

pub struct Locus {
    pub gene_name: String,
    pub allele_value: f32,       // [0.0, 1.0] baseline genetic value
    pub epigenetic_marker: f32,  // Dynamic runtime expression modifier [-1.0, 1.0]
}
```

$$\text{Effective Expressed Trait } T_i = \text{clamp}_{[0, 1]}\left(\text{allele}_i \cdot (1.0 + \text{epigenetic\_marker}_i)\right)$$

### Canonical Core Traits:
1. **Exploration Drive ($\xi \in [0, 1]$)**: Governs branching entropy in counterfactual tree search.
2. **Risk Tolerance ($\rho \in [0, 1]$)**: Dictates whether destructive tool invocations require prior simulation.
3. **Verification Threshold ($\theta \in [0, 1]$)**: Minimum empirical confidence required before asserting goal completion.
4. **Epistemic Humility ($\eta \in [0, 1]$)**: Propensity to invalidate prior beliefs upon contradictory sensory input.

---

## 3. Behavioral Drift & Divergence Metrics

The `genos-eval` crate monitors phenotypic drift by calculating divergence across four mathematical dimensions:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Phenotypic Divergence Metrics                             │
├────────────────────────────┬───────────────────────────────────────────────────────────┤
│ Metric Key                 │ Mathematical Formalism                                    │
├────────────────────────────┼───────────────────────────────────────────────────────────┤
│ `unsupported_claim_rate`   │ $U = \frac{|\{c \in \text{Claims} \mid \text{Ev}(c) = \emptyset\}|}{|\text{Claims}|}$ │
├────────────────────────────┼───────────────────────────────────────────────────────────┤
│ `semantic_drift` ($D_{sem}$)│ $D_{sem}(\mathbf{e}_{\text{obs}}, \mathbf{e}_{\text{base}}) = 1 - \frac{\mathbf{e}_{\text{obs}} \cdot \mathbf{e}_{\text{base}}}{\|\mathbf{e}_{\text{obs}}\| \|\mathbf{e}_{\text{base}}\|}$ │
├────────────────────────────┼───────────────────────────────────────────────────────────┤
│ `tool_stagnation_index`    │ $S = \frac{1}{N}\sum_{t=1}^N \mathbb{I}(\mathcal{W}_t = \mathcal{W}_{t-1})$ │
├────────────────────────────┼───────────────────────────────────────────────────────────┤
│ `latency_distribution_shift`│ $W_1(F_{\text{obs}}, F_{\text{base}}) = \int_{-\infty}^{\infty} |F_{\text{obs}}(t) - F_{\text{base}}(t)| \, dt$ │
└────────────────────────────┴───────────────────────────────────────────────────────────┘
```

### Divergence Evaluation Model:
```rust
/// Configuration parameters for trait drift statistical evaluation.
#[derive(Clone, Debug)]
pub struct DriftEvalConfig {
    pub tolerance: f64,
    pub n_samples: usize,
}

pub struct TraitDivergence {
    pub trait_name: String,
    pub expected: f64,
    pub observed: f64,
    pub absolute_delta: f64,
    pub tolerance: f64,
    pub p_value: f64,
    pub diverged: bool,
}

pub fn evaluate_trait_drift(
    expected: f64,
    observed: f64,
    config: &DriftEvalConfig,
) -> TraitDivergence {
    let delta = (expected - observed).abs();
    let std_err = (observed * (1.0 - observed) / config.n_samples as f64).sqrt().max(1e-5);
    let z_score = delta / std_err;
    let p_value = 2.0 * (1.0 - normal_cdf(z_score));
    
    TraitDivergence {
        trait_name: "unsupported_claim_rate".into(),
        expected,
        observed,
        absolute_delta: delta,
        tolerance: config.tolerance,
        p_value,
        diverged: delta > config.tolerance && p_value < 0.01,
    }
}
```

---

## 4. Controlled Heredity Experiments (Nature vs. Nurture)

To disentangle genomic heredity ($\mathcal{G}$) from environmental prompting ($\mathcal{W}$), GenOS executes $2 \times 2$ factorial cohort experiments using sibling clones:

```text
                                    Parent Genome G0
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     ▼                                           ▼
             Sibling Clone S_A                           Sibling Clone S_B
          (Genomic Mutation G_A)                      (Genomic Baseline G_0)
                     │                                           │
          ┌──────────┴──────────┐                     ┌──────────┴──────────┐
          ▼                     ▼                     ▼                     ▼
     Task Env W_1          Task Env W_2          Task Env W_1          Task Env W_2
          │                     │                     │                     │
          ▼                     ▼                     ▼                     ▼
    Phenotype P_A1        Phenotype P_A2        Phenotype P_B1        Phenotype P_B2
```

### Two-Way Factorial ANOVA Model:
$$\mathcal{P}_{ijk} = \mu + \alpha_i(\mathcal{G}) + \beta_j(\mathcal{W}) + (\alpha\beta)_{ij}(\mathcal{G} \times \mathcal{W}) + \epsilon_{ijk}$$
- **Main Genetic Effect ($\alpha_i$)**: Variance explained purely by genomic differences ($F_{\mathcal{G}} > F_{\text{crit}}$ indicates true genetic heredity).
- **Main Environmental Effect ($\beta_j$)**: Variance driven by environment difficulty.
- **Interaction Effect ($(\alpha\beta)_{ij}$)**: Measures model sensitivity and context fragility.

---

## 5. Artificial Selection & Pareto Frontiers

GenOS applies multi-objective artificial selection across populations of agent genomes using Non-dominated Sorting Genetic Algorithm (NSGA-II) principles:

```text
       Fitness F_1 (Accuracy / Pass Rate)
        ▲
   1.0  │             ★ Genome Alpha (0.95, 0.40)
        │            /
        │           /
        │          ★ Genome Beta (0.88, 0.85)  ◄─── Pareto Frontier
        │         /
        │        /
        │       ★ Genome Gamma (0.70, 0.98)
        │
   0.0  └────────────────────────────────────────► Fitness F_2 (Cost Efficiency)
       0.0                                   1.0
```

### Pareto Selection Invariants:
1. **Domination Criterion**: A genome $G_A$ dominates $G_B$ ($G_A \succ G_B$) iff $\forall k, f_k(G_A) \ge f_k(G_B)$ and $\exists j, f_j(G_A) > f_j(G_B)$.
2. **Crowding Distance Preservation**: When selecting surviving genomes for subsequent generations, GenOS maintains diversity along the Pareto front by penalizing genomic clustering.

---

## 6. Inferred Traits Discovery & Promotion Pipeline

GenOS strictly forbids automatic, unreviewed mutation of genomes from raw observations. Instead, observations follow an explicit multi-stage promotion pipeline:

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 1. Empirical Observation: Collect N >= 30 runs with p-value < 0.01     │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 2. Inferred Trait Claim: Attach InferredGenomeTraitClaim metadata      │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 3. Replication Gate: Replicate claim across independent environments   │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 4. Explicit Promotion: Run `genos agent promote-trait --claim <ID>`    │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 5. Derived Child Genome: Emit G_{k+1} with updated baseline alleles    │
 └────────────────────────────────────────────────────────────────────────┘
```

This strict architectural separation guarantees that agent genotypes remain mathematically immutable and auditable while supporting data-driven evolutionary adaptation.
