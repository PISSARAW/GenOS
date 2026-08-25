//! Ant Colony Optimization (Dorigo): probabilistic path selection where the
//! probability of choosing an edge grows with `pheromone^alpha * heuristic^beta`,
//! complemented by global evaporation. Completes the stigmergy infrastructure
//! (`genos-protocol::mesh`) into a full constructive optimizer.

use serde::{Deserialize, Serialize};

/// A weighted graph edge for ACO.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AcoEdge {
    pub to: String,
    /// Pheromone concentration in `[0, +inf)` (unbounded like real stigmergy).
    pub pheromone: f32,
    /// Heuristic desirability (e.g. inverse distance), strictly positive.
    pub heuristic: f32,
}

/// One ant colony solving a path-construction problem over an adjacency map.
#[derive(Clone, Debug, Default)]
pub struct AntColony {
    pub alpha: f32,
    pub beta: f32,
}

impl AntColony {
    pub fn new(alpha: f32, beta: f32) -> Self {
        Self { alpha, beta }
    }

    /// Probability of each outgoing edge being chosen by one ant:
    /// `p_ij ∝ tau_ij^alpha * eta_ij^beta`, normalized over candidates.
    pub fn edge_probabilities(&self, edges: &[AcoEdge]) -> Vec<f32> {
        let weights: Vec<f32> = edges
            .iter()
            .map(|e| e.pheromone.max(1e-9).powf(self.alpha) * e.heuristic.max(1e-9).powf(self.beta))
            .collect();
        let total: f32 = weights.iter().sum();
        if total <= 0.0 {
            return vec![1.0 / edges.len() as f32; edges.len()];
        }
        weights.into_iter().map(|w| w / total).collect()
    }

    /// Samples one edge index from the probability distribution
    /// (deterministic for a given seed).
    pub fn choose_edge(&self, probabilities: &[f32], rng_state: &mut u64) -> usize {
        let unit =
            ((crate::hgt::splitmix64(rng_state) >> 40) as f32) / ((1u64 << 24) as f32);
        let mut cumulative = 0.0;
        for (index, p) in probabilities.iter().enumerate() {
            cumulative += p;
            if unit <= cumulative {
                return index;
            }
        }
        probabilities.len().saturating_sub(1)
    }

    /// Deposits pheromone on an edge after a solution round-trip; deposit is
    /// proportional to solution quality `q ∈ [0, 1]`.
    pub fn deposit(&self, edge: &mut AcoEdge, quality: f32) {
        let q = quality.clamp(0.0, 1.0);
        edge.pheromone += q * 10.0 / (1.0 + 1.0);
    }

    /// Global evaporation: `tau <- (1 - rho) * tau`, keeps old trails fading.
    pub fn evaporate(&self, edges: &mut [AcoEdge], rho: f32) {
        let factor = (1.0 - rho.clamp(0.0, 1.0)).max(0.01);
        for e in edges.iter_mut() {
            e.pheromone *= factor;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn edges() -> Vec<AcoEdge> {
        vec![
            AcoEdge { to: "short".into(), pheromone: 1.0, heuristic: 2.0 },
            AcoEdge { to: "long".into(), pheromone: 1.0, heuristic: 1.0 },
        ]
    }

    #[test]
    fn probabilities_are_normalized_and_proportional_to_heuristic() {
        let colony = AntColony::new(1.0, 2.0);
        let probs = colony.edge_probabilities(&edges());
        assert!((probs[0] + probs[1] - 1.0).abs() < 1e-6);
        // Même phéromone : l'arête la plus heuristique domine.
        assert!(probs[0] > probs[1]);
        assert!((probs[0] - 4.0 / 5.0).abs() < 1e-6); // (1*2²)/(1*2²+1*1²)
    }

    #[test]
    fn pheromone_dominance_flips_the_preference() {
        let colony = AntColony::new(2.0, 1.0);
        let mut e = edges();
        e[1].pheromone = 8.0;
        let probs = colony.edge_probabilities(&e);
        // tau^2 : 1 vs 64 -> l'arête très marquée écrase l'heuristique.
        assert!(probs[1] > 0.95);
    }

    #[test]
    fn sampling_follows_the_distribution_over_many_draws() {
        let colony = AntColony::new(1.0, 2.0);
        let probs = colony.edge_probabilities(&edges());
        let mut rng = 42u64;
        let mut first = 0;
        for _ in 0..1000 {
            if colony.choose_edge(&probs, &mut rng) == 0 {
                first += 1;
            }
        }
        // ~80% attendus ; tolérance statistique large pour rester robuste.
        assert!(first > 700 && first < 900, "observed {first}/1000");
    }

    #[test]
    fn deposit_then_evaporation_stabilizes_trails() {
        let colony = AntColony::new(1.0, 1.0);
        let mut e = edges();
        let initial = e[0].pheromone;
        colony.deposit(&mut e[0], 1.0);
        assert!(e[0].pheromone > initial);
        colony.evaporate(&mut e, 0.5);
        assert!((e[0].pheromone - (initial + 5.0) * 0.5).abs() < 1e-6);
        // L'évaporation seule ramène tout vers zéro sans jamais devenir négative.
        for _ in 0..50 {
            colony.evaporate(&mut e, 0.5);
        }
        assert!(e[0].pheromone >= 0.0 && e[0].pheromone < 0.01);
        assert!(e[1].pheromone >= 0.0 && e[1].pheromone < 0.01);
    }
}
