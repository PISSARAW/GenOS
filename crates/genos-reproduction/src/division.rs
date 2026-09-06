use genos_genome::Genome;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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
        let mut child = genome.clone();
        child.genome_id = Uuid::new_v4();
        let id_bytes = child.genome_id.as_bytes();
        for (index, nucleotide) in child
            .chromosome_maternal
            .sequence
            .iter_mut()
            .chain(child.chromosome_paternal.sequence.iter_mut())
            .enumerate()
        {
            let score = id_bytes[index % id_bytes.len()] as f64 / 256.0;
            if score < mutation_rate {
                *nucleotide = match nucleotide {
                    genos_genome::DnaNucleotide::A => genos_genome::DnaNucleotide::C,
                    genos_genome::DnaNucleotide::C => genos_genome::DnaNucleotide::G,
                    genos_genome::DnaNucleotide::G => genos_genome::DnaNucleotide::T,
                    genos_genome::DnaNucleotide::T => genos_genome::DnaNucleotide::A,
                };
            }
        }
        Ok((parent, child))
    }

    pub fn mitosis(genome: &Genome) -> Result<(Genome, Genome), String> {
        let parent = genome.clone();
        let mut child = genome.clone();
        child.genome_id = Uuid::new_v4();
        Ok((parent, child))
    }

    pub fn budding(mother: &Genome, daughter_volume: f64) -> Result<(Genome, Genome), String> {
        if daughter_volume <= 0.0 || daughter_volume >= 1.0 {
            return Err("Daughter volume must be between 0 and 1".to_string());
        }
        let parent = mother.clone();
        let mut daughter = mother.clone();
        daughter.genome_id = Uuid::new_v4();
        Ok((parent, daughter))
    }

    pub fn schizogony(mother: &Genome, merozoite_count: usize) -> Result<Vec<Genome>, String> {
        if merozoite_count == 0 {
            return Err("Merozoite count must be > 0".to_string());
        }
        let mut daughters = Vec::with_capacity(merozoite_count);
        for _ in 0..merozoite_count {
            let mut daughter = mother.clone();
            daughter.genome_id = Uuid::new_v4();
            daughters.push(daughter);
        }
        Ok(daughters)
    }
}
