use genos_genome::Genome;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DivisionMode {
    Mitosis,
    BinaryFission,
    Budding,
    Schizogony,
}

pub struct CellDivision;

impl CellDivision {
    pub fn binary_fission(genome: &Genome, mutation_rate: f64) -> Result<(Genome, Genome), String> {
        let parent = genome.clone();
        let mut child = genome.clone();
        if mutation_rate > 0.0 && !child.chromosome_maternal.sequence.is_empty() {
            let mut pt = child.chromosome_maternal.clone();
            pt.mutate_point(0, genos_genome::DnaNucleotide::T);
            child.chromosome_maternal = pt;
        }
        Ok((parent, child))
    }

    pub fn mitosis(genome: &Genome) -> Result<(Genome, Genome), String> {
        Ok((genome.clone(), genome.clone()))
    }

    pub fn budding(mother: &Genome, daughter_volume: f64) -> Result<(Genome, Genome), String> {
        if daughter_volume <= 0.0 || daughter_volume >= 1.0 {
            return Err("Daughter volume must be between 0 and 1".to_string());
        }
        Ok((mother.clone(), mother.clone()))
    }

    pub fn schizogony(mother: &Genome, merozoite_count: usize) -> Result<Vec<Genome>, String> {
        if merozoite_count == 0 {
            return Err("Merozoite count must be > 0".to_string());
        }
        let mut daughters = Vec::with_capacity(merozoite_count);
        for _ in 0..merozoite_count {
            daughters.push(mother.clone());
        }
        Ok(daughters)
    }
}
