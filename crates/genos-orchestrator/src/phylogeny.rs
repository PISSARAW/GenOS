//! Phylogénie : hybridation, interfécondité et horloge moléculaire.

use genos_cell::AgentCell;
use genos_genome::{DnaStrand, Genome};
use genos_reproduction::PhylogeneticTree;
use genos_reproduction::phylogeny::{
    HybridizationResult, molecular_clock, trace_mitochondrial_eve,
};

/// Laboratoire de phylogenèse (méthodes statiques).
pub struct PhylogenyLab;

impl PhylogenyLab {
    pub fn can_interbreed(a: &Genome, b: &Genome, geographic_isolation: bool) -> bool {
        PhylogeneticTree::can_interbreed(a, b, geographic_isolation)
    }

    pub fn can_interbreed_within(a: &Genome, b: &Genome, max_divergence: f64) -> bool {
        PhylogeneticTree::can_interbreed_with_threshold(a, b, max_divergence)
    }

    pub fn hybridize(a: &Genome, b: &Genome, is_plant: bool) -> HybridizationResult {
        PhylogeneticTree::attempt_hybridization(a, b, is_plant)
    }

    pub fn divergence_time(a: &Genome, b: &Genome) -> f64 {
        PhylogeneticTree::estimate_divergence_time(a, b)
    }

    pub fn molecular_clock(
        a: &Genome,
        b: &Genome,
        mutation_rate_per_generation: f64,
    ) -> Result<f64, String> {
        molecular_clock(a, b, mutation_rate_per_generation)
    }

    pub fn mitochondrial_eve(population: &[AgentCell]) -> Option<DnaStrand> {
        trace_mitochondrial_eve(population)
    }
}
