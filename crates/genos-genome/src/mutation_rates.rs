use crate::dna::DnaNucleotide;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MutationRates {
    pub nucleotide: f64,
    pub codon: f64,
    pub gene: f64,
    pub segment: f64,
    pub chromosome: f64,
    pub genome: f64,
}

impl Default for MutationRates {
    fn default() -> Self {
        Self {
            nucleotide: 0.01,
            codon: 0.005,
            gene: 0.001,
            segment: 0.0005,
            chromosome: 0.0001,
            genome: 0.00005,
        }
    }
}

impl DnaNucleotide {
    pub fn nucleotide_random<R: rand::Rng + ?Sized>(rng: &mut R) -> Self {
        match rng.next_u32() % 4 {
            0 => DnaNucleotide::A,
            1 => DnaNucleotide::C,
            2 => DnaNucleotide::G,
            _ => DnaNucleotide::T,
        }
    }

    pub fn nucleotide_from_char(c: char) -> Self {
        match c.to_ascii_uppercase() {
            'A' => DnaNucleotide::A,
            'C' => DnaNucleotide::C,
            'G' => DnaNucleotide::G,
            'T' | 'U' => DnaNucleotide::T,
            _ => DnaNucleotide::A,
        }
    }
}
