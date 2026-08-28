# Founder Effect

## Overview

The **Founder Effect** is an evolutionary phenomenon occurring when a new population (a colony) is established by a very small number of individuals from a larger parent population. 

Due to the small sample size, the new colony is subjected to extreme genetic drift. It typically carries only a fraction of the genetic diversity (and thus, genetic variance) of the original population. In this bottleneck-like scenario, rare alleles (or in GenOS's quantitative model, extreme trait values) may be entirely lost, and the colony's evolutionary trajectory can heavily diverge from the parent population.

## Evolutionary Logic

Unlike a standard genetic bottleneck—which amputates and shrinks an *existing* population in place—the founder effect **creates a new, isolated lineage**. 

The sampling of founders is strictly random and completely independent of individual fitness. The genetic makeup of the founding members heavily biases the initial state of the new colony.

## Implementation in GenOS

The founder effect is implemented in `crates/genos-eval/src/forces.rs` via the `founder_effect` function.

### `founder_effect` Function

This function samples a `founder_count` of `AgentGenome` instances from the `source` population. To ensure replicability in scientific experiments and evolutionary tracking, the sampling is fully deterministic, governed by a provided `seed`.

```rust
pub fn founder_effect(source: &[AgentGenome], founder_count: usize, seed: u64) -> Vec<AgentGenome> {
    if source.is_empty() || founder_count == 0 {
        return Vec::new();
    }
    
    // Deterministic random number generator based on the provided seed
    let mut seed_bytes = [0u8; 32];
    seed_bytes[..8].copy_from_slice(&seed.to_le_bytes());
    let mut rng = rand::rngs::StdRng::from_seed(seed_bytes);
    
    // Randomize indices and sample the founders
    let mut indices: Vec<usize> = (0..source.len()).collect();
    indices.shuffle(&mut rng);
    
    indices
        .into_iter()
        .take(founder_count.min(source.len()))
        .filter_map(|i| source.get(i).cloned())
        .collect()
}
```

**Key Architectural Details:**
1. **Instantiation over Mutation:** Returns a new `Vec<AgentGenome>` colony rather than modifying the original `source` slice.
2. **Determinism:** `rand::rngs::StdRng::from_seed` ensures that for a given `seed`, the same founders are always drawn.
3. **Safety Bounds:** Gracefully handles degenerate cases (e.g., zero founders requested, or requesting more founders than the source population size).

## Architecture & Flow

```mermaid
graph LR
    S[Source Population]
    S -->|Size: N| A
    A{founder_effect} -->|seed| PRNG(StdRng)
    PRNG -->|Shuffle Indices| B[Sample n individuals]
    B -->|Clone Genomes| C[Colony Population]
    
    subgraph Properties
    direction TB
    P1(Size: n << N)
    P2(Reduced Genetic Variance)
    P3(Independent of Fitness)
    end
    C -.-> Properties
```

## Cross-References

- [Population Genetics Overview](06_population_genetics.md)
- [Wright Inbreeding Coefficient](09_wright_inbreeding.md)
- Code Reference: `crates/genos-eval/src/forces.rs`
