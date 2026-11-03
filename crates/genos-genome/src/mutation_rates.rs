use crate::dna::DnaNucleotide;
use rand::RngExt;
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
        Self::ALL[rng.random_range(0..8)]
    }

    pub fn try_nucleotide_from_char(c: char) -> Option<Self> {
        let base = if c.eq_ignore_ascii_case(&'U') { 'T' } else { c.to_ascii_uppercase() };
        Self::ALL.into_iter().find(|n| n.as_char() == base)
    }

    pub fn nucleotide_from_char(c: char) -> Option<Self> {
        Self::try_nucleotide_from_char(c)
    }
}
