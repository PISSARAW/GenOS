//! Trajectory replay: reconstruct and replay evolutionary trajectories
//! from fossil records and event sequences.
//!
//! Complements the SelfModel in conscience.rs: while SelfModel records
//! GenerationSnapshot entries during live evolution, this module reconstructs
//! and replays entire trajectories from serialized fossils and event logs.

use crate::dna::DnaStrand;
use crate::fitness::FitnessExperiment;
use crate::genome::Genome;
use rand::rngs::StdRng;
use rand::SeedableRng;
use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════════════════════
// Fossil record — serialized genome snapshot for ancestral reconstruction
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FossilRecord {
    serialized: String,
}

impl FossilRecord {
    /// Captures a genome as a fossil record for later reconstruction.
    pub fn from_genome(genome: &Genome) -> Result<Self, String> {
        let serialized = serde_json::to_string(genome)
            .map_err(|e| format!("Fossil serialization failed: {e}"))?;
        Ok(Self { serialized })
    }

    /// Returns the raw serialized genome data.
    pub fn serialized(&self) -> &str {
        &self.serialized
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Evolution events
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum EvolutionEvent {
    /// Stochastic point mutation at the given per-nucleotide rate.
    Mutate { rate: f64 },
    /// Genetic exchange with a partner (partner_id identifies the donor).
    Crossover { partner_id: u64 },
    /// Selection pressure that modulates gene expression volumes.
    Select { pressure: f64 },
    /// Environmental shift encoded as opaque parameter bytes.
    EnvironmentalChange { params: Vec<u8> },
}

// ═══════════════════════════════════════════════════════════════════════════════
// Replay result
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Clone, Debug)]
pub struct ReplayResult {
    /// Full genome sequence from ancestor through each applied event.
    pub genomes: Vec<Genome>,
    /// Fitness measured at each step (parallel to `genomes`).
    pub fitness_trajectory: Vec<f64>,
    /// Normalized divergence [0.0, 1.0] between first and last genome.
    pub divergence_from_original: f64,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Trajectory replay engine
// ═══════════════════════════════════════════════════════════════════════════════

pub struct TrajectoryReplay;

impl TrajectoryReplay {
    /// Reconstructs an ancestor genome from a fossil record.
    pub fn reconstruct_ancestor(fossil: &FossilRecord) -> Genome {
        serde_json::from_str(fossil.serialized())
            .expect("FossilRecord contains invalid genome data")
    }

    /// Applies a single evolutionary event to a genome, producing the next state.
    pub fn apply_event(genome: &Genome, event: &EvolutionEvent) -> Genome {
        let mut rng = StdRng::seed_from_u64(42);
        Self::apply_event_with_rng(genome, event, &mut rng)
    }

    fn apply_event_with_rng<R: rand::Rng + ?Sized>(
        genome: &Genome,
        event: &EvolutionEvent,
        rng: &mut R,
    ) -> Genome {
        let mut next = genome.clone();
        match event {
            EvolutionEvent::Mutate { rate } => {
                if rate.is_finite() && *rate > 0.0 {
                    next.mutate_stochastic(*rate, rng);
                }
            }
            EvolutionEvent::Crossover { .. } => {
                // Simulated exchange: modest mutation without the partner genome.
                next.mutate_stochastic(0.05, rng);
            }
            EvolutionEvent::Select { pressure } => {
                let factor = (1.0 - pressure.clamp(0.0, 1.0) * 0.1).max(0.01);
                for gene in next.genes.values_mut() {
                    gene.expression_volume = (gene.expression_volume * factor).max(0.01);
                }
            }
            EvolutionEvent::EnvironmentalChange { params } => {
                if !params.is_empty() {
                    let strand = DnaStrand::synthesize(&format!("{:?}", params));
                    next.extra_chromosomes.push(strand);
                }
            }
        }
        next
    }

    /// Replays a full trajectory from an ancestor through a sequence of events.
    pub fn replay_trajectory(ancestor: &Genome, events: &[EvolutionEvent]) -> ReplayResult {
        let experiment = FitnessExperiment::new();
        let original_hash = ancestor.content_hash();
        let mut genomes = vec![ancestor.clone()];
        let mut fitness_trajectory = vec![experiment.evaluate(ancestor, "replay").score];

        let mut current = ancestor.clone();
        for event in events {
            current = Self::apply_event(&current, event);
            fitness_trajectory.push(experiment.evaluate(&current, "replay").score);
            genomes.push(current.clone());
        }

        let divergence = divergence_score(&genomes[0], genomes.last().unwrap(), &original_hash);

        ReplayResult {
            genomes,
            fitness_trajectory,
            divergence_from_original: divergence,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Divergence metric
// ═══════════════════════════════════════════════════════════════════════════════

fn divergence_score(original: &Genome, current: &Genome, original_hash: &str) -> f64 {
    if current.content_hash() == original_hash {
        return 0.0;
    }
    let maternal = hamming_ratio(&original.chromosome_maternal, &current.chromosome_maternal);
    let paternal = hamming_ratio(&original.chromosome_paternal, &current.chromosome_paternal);
    ((maternal + paternal) / 2.0).min(1.0)
}

fn hamming_ratio(a: &DnaStrand, b: &DnaStrand) -> f64 {
    let max_len = a.len().max(b.len());
    if max_len == 0 {
        return 0.0;
    }
    let min_len = a.len().min(b.len());
    let mut diffs = max_len - min_len;
    for i in 0..min_len {
        if a.as_slice()[i] != b.as_slice()[i] {
            diffs += 1;
        }
    }
    diffs as f64 / max_len as f64
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gene::Gene;

    fn make_ancestor() -> Genome {
        let mut genome = Genome::new("ATGCCGTAGCTAGCTAGCTAGCTAGCTA");
        genome.insert_gene(Gene::new("GENE_A", "ATGCCGTA"));
        genome.insert_gene(Gene::new("GENE_B", "GCTAGCTA"));
        genome
    }

    #[test]
    fn replay_with_empty_events_returns_single_genome() {
        let ancestor = make_ancestor();
        let result = TrajectoryReplay::replay_trajectory(&ancestor, &[]);
        assert_eq!(result.genomes.len(), 1);
        assert_eq!(result.fitness_trajectory.len(), 1);
        assert_eq!(result.divergence_from_original, 0.0);
    }

    #[test]
    fn replay_with_mutate_events_changes_genome() {
        let ancestor = make_ancestor();
        let events = vec![
            EvolutionEvent::Mutate { rate: 0.8 },
            EvolutionEvent::Mutate { rate: 0.8 },
        ];
        let result = TrajectoryReplay::replay_trajectory(&ancestor, &events);
        assert_eq!(result.genomes.len(), 3);
        assert!(result.divergence_from_original > 0.0);
    }

    #[test]
    fn fitness_trajectory_has_correct_length() {
        let ancestor = make_ancestor();
        let events = vec![
            EvolutionEvent::Mutate { rate: 0.1 },
            EvolutionEvent::Select { pressure: 0.5 },
            EvolutionEvent::EnvironmentalChange { params: vec![1, 2, 3] },
        ];
        let result = TrajectoryReplay::replay_trajectory(&ancestor, &events);
        assert_eq!(result.fitness_trajectory.len(), events.len() + 1);
    }

    #[test]
    fn fossil_record_round_trip_preserves_genome() {
        let genome = make_ancestor();
        let fossil = FossilRecord::from_genome(&genome).expect("fossil creation failed");
        let reconstructed = TrajectoryReplay::reconstruct_ancestor(&fossil);
        assert_eq!(reconstructed.content_hash(), genome.content_hash());
    }
}
