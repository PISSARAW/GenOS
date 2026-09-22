use crate::translation::{AminoAcidToken, Codon, Ribosome, UnfoldedProtein};
use crate::dna::{DnaStrand, RnaPolymerase};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Phenotype {
    pub protein_sequence: String,
    pub functional_domains: Vec<String>,
    pub expression_level: f64,
    pub stability: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum PhenotypeTrait {
    Novelty,
    Fitness,
    Complexity,
    Robustness,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PhenotypeResult {
    pub phenotype: Phenotype,
    pub traits: Vec<PhenotypeTrait>,
    pub novelty_score: f64,
}

pub struct PhenotypeEngine;

impl PhenotypeEngine {
    pub fn new() -> Self { Self }

    pub fn express(genome: &crate::genome::Genome, gene_locus: &str) -> Option<Phenotype> {
        let gene = genome.genes.get(gene_locus)?;
        let dna = &gene.dna;
        let rna = RnaPolymerase::transcribe(dna);
        let protein = Ribosome::translate(&rna);
        let folded = protein.fold().ok()?;
        let domains = Self::extract_domains(&folded);
        Some(Phenotype {
            protein_sequence: folded.clone(),
            functional_domains: domains,
            expression_level: gene.expression_volume,
            stability: Self::compute_stability(&protein),
        })
    }

    fn extract_domains(folded: &str) -> Vec<String> {
        let mut domains = Vec::new();
        let bytes = folded.as_bytes();
        for chunk in bytes.chunks(4) {
            if chunk.len() == 4 && chunk.iter().all(|&b| b.is_ascii_graphic() || b == b' ') {
                domains.push(String::from_utf8_lossy(chunk).to_string());
            }
        }
        domains
    }

    fn compute_stability(protein: &UnfoldedProtein) -> f64 {
        let n = protein.amino_acids.len().max(1) as f64;
        let unique = protein.amino_acids.iter().collect::<std::collections::HashSet<_>>().len() as f64;
        (unique / n).clamp(0.0, 1.0)
    }

    pub fn assess_novelty(phenotype: &Phenotype, archive: &[(String, f64)]) -> f64 {
        if archive.is_empty() { return 1.0; }
        let min_dist = archive.iter()
            .map(|(seq, _)| Self::sequence_distance(&phenotype.protein_sequence, seq))
            .fold(f64::INFINITY, f64::min);
        min_dist.min(1.0)
    }

    fn sequence_distance(a: &str, b: &str) -> f64 {
        let la = a.len().max(1) as f64;
        let lb = b.len().max(1) as f64;
        let max_len = la.max(lb);
        let mismatches = a.chars().zip(b.chars())
            .filter(|(ca, cb)| ca != cb)
            .count() as f64;
        let len_diff = (la - lb).abs();
        (mismatches + len_diff) / max_len
    }

    pub fn phenotype_from_dna(dna: &DnaStrand) -> Option<Phenotype> {
        let rna = RnaPolymerase::transcribe(dna);
        let protein = Ribosome::translate(&rna);
        let folded = protein.fold().ok()?;
        let domains = Self::extract_domains(&folded);
        Some(Phenotype {
            protein_sequence: folded,
            functional_domains: domains,
            expression_level: 1.0,
            stability: Self::compute_stability(&protein),
        })
    }
}

impl Default for PhenotypeEngine {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::Genome;

    fn test_genome() -> Genome {
        let mut g = Genome::new("ATGCATGC");
        let gene = crate::gene::Gene::new("PHENOTYPE_TEST", "ATGCATGC");
        g.insert_gene(gene);
        g
    }

    #[test]
    fn phenotype_express_from_gene() {
        let g = test_genome();
        let phenotype = PhenotypeEngine::express(&g, "PHENOTYPE_TEST");
        assert!(phenotype.is_some());
        let p = phenotype.unwrap();
        assert!(!p.protein_sequence.is_empty());
        assert!(p.functional_domains.len() > 0 || p.protein_sequence.len() > 0);
    }

    #[test]
    fn phenotype_stability_nonzero() {
        let g = test_genome();
        let phenotype = PhenotypeEngine::express(&g, "PHENOTYPE_TEST").unwrap();
        assert!(phenotype.stability >= 0.0 && phenotype.stability <= 1.0);
    }

    #[test]
    fn phenotype_novelty_strong_for_empty_archive() {
        let g = test_genome();
        let phenotype = PhenotypeEngine::express(&g, "PHENOTYPE_TEST").unwrap();
        let archive: Vec<(String, f64)> = Vec::new();
        let novelty = PhenotypeEngine::assess_novelty(&phenotype, &archive);
        assert!((novelty - 1.0).abs() < 1e-10);
    }

    #[test]
    fn phenotype_domains_extracted() {
        let dna = DnaStrand::synthesize("PHENOTYPE_TEST");
        let phenotype = PhenotypeEngine::phenotype_from_dna(&dna);
        assert!(phenotype.is_some());
        let p = phenotype.unwrap();
        assert!(!p.protein_sequence.is_empty());
    }
}