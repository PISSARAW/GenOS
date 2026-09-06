use genos_genome::Genome;
use rand::RngExt;
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
        if !(0.0..=1.0).contains(&mutation_rate) {
            return Err("Mutation rate must be between 0 and 1".to_string());
        }
            let parent = genome.clone();
            let mut child = genome.derive_child();
        let mut rng = rand::rng();
            let mut maternal = child.chromosome_maternal.as_slice().to_vec();
            let mut paternal = child.chromosome_paternal.as_slice().to_vec();
            for nucleotide in maternal.iter_mut().chain(paternal.iter_mut()) {
            if rng.random_bool(mutation_rate) {
                *nucleotide = match nucleotide {
                    genos_genome::DnaNucleotide::A => genos_genome::DnaNucleotide::C,
                    genos_genome::DnaNucleotide::C => genos_genome::DnaNucleotide::G,
                    genos_genome::DnaNucleotide::G => genos_genome::DnaNucleotide::T,
                    genos_genome::DnaNucleotide::T => genos_genome::DnaNucleotide::A,
                };
            }
        }
        child.chromosome_maternal.replace_sequence(maternal);
        child.chromosome_paternal.replace_sequence(paternal);
        Ok((parent, child))
    }

    pub fn mitosis(genome: &Genome) -> Result<(Genome, Genome), String> {
        let parent = genome.clone();
        let child = genome.derive_child();
        Ok((parent, child))
    }

    pub fn budding(mother: &Genome, daughter_volume: f64) -> Result<(Genome, Genome), String> {
        if daughter_volume <= 0.0 || daughter_volume >= 1.0 {
            return Err("Daughter volume must be between 0 and 1".to_string());
        }
            let parent = mother.clone();
            let daughter = mother.derive_child();
        Ok((parent, daughter))
    }

    pub fn schizogony(mother: &Genome, merozoite_count: usize) -> Result<Vec<Genome>, String> {
        if merozoite_count == 0 {
            return Err("Merozoite count must be > 0".to_string());
        }
        let mut daughters = Vec::with_capacity(merozoite_count);
        for _ in 0..merozoite_count {
                let daughter = mother.derive_child();
            daughters.push(daughter);
        }
        Ok(daughters)
    }
}
