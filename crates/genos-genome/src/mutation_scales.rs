use crate::dna::{DnaNucleotide, DnaStrand};
use crate::genome::Genome;
use crate::mutation_rates::MutationRates;
use rand::RngExt;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum MutationScale {
    Nucleotide,
    Codon,
    Gene,
    Segment,
    Chromosome,
    Genome,
    Intergenomic,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum MutationEffect {
    Substitution,
    Insertion { count: usize },
    Deletion { count: usize },
    Duplication,
    Inversion,
    Translocation { target_position: usize },
    Amplification { factor: u32 },
    GeneDeletion,
    ChromosomalTranslocation { breakpoint_maternal: usize, breakpoint_paternal: usize },
    Fusion,
    Fission { breakpoint: usize },
    TransposonInsertion { source_locus: String, target_position: usize },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MutationResult {
    pub scale: MutationScale,
    pub effect: MutationEffect,
    pub affected_locus: Option<String>,
    pub positions_changed: usize,
    pub successful: bool,
    pub description: String,
}

pub struct MultiScaleMutator;

impl MultiScaleMutator {
    pub fn new() -> Self { Self }

    pub fn mutate_nucleotide<R: rand::Rng + ?Sized>(
        strand: &mut DnaStrand,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        let len = strand.len();
        for pos in 0..len {
            if rng.random_bool(rate.clamp(0.0, 1.0)) {
                let original = strand.as_slice()[pos].clone();
                let mutated = DnaNucleotide::nucleotide_random(rng);
                strand.mutate_point(pos, mutated.clone());
                results.push(MutationResult {
                    scale: MutationScale::Nucleotide,
                    effect: MutationEffect::Substitution,
                    affected_locus: None,
                    positions_changed: 1,
                    successful: original != mutated,
                    description: format!(
                        "Nucleotide substitution at {}: {:?} -> {:?}",
                        pos, original, mutated
                    ),
                });
            }
        }
        results
    }

    pub fn mutate_codon<R: rand::Rng + ?Sized>(
        strand: &mut DnaStrand,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        let len = strand.len();
        let codons = len / 3;
        for i in 0..codons {
            if rng.random_bool(rate.clamp(0.0, 1.0)) {
                let pos = i * 3;
                let original_chars: Vec<char> = strand.as_str().chars().collect();
                let old_char = strand.as_str().chars().nth(pos).unwrap_or('A');
                let mut new_char = old_char;
                while new_char == old_char {
                    new_char = match rng.next_u32() % 4 {
                        0 => 'A', 1 => 'C', 2 => 'G', _ => 'T',
                    };
                }
                let mut new_seq = strand.as_slice().to_vec();
                new_seq[pos] = DnaNucleotide::nucleotide_from_char(new_char);
                strand.replace_sequence(new_seq);
                results.push(MutationResult {
                    scale: MutationScale::Codon,
                    effect: MutationEffect::Substitution,
                    affected_locus: None,
                    positions_changed: 1,
                    successful: original_chars[pos] != new_char,
                    description: format!(
                        "Codon mutation at codon {}: {:?} -> {:?}",
                        i, &original_chars[pos..pos + 3], new_char
                    ),
                });
            }
        }
        results
    }

    pub fn mutate_gene<R: rand::Rng + ?Sized>(
        genome: &mut Genome,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        let loci: Vec<String> = genome.genes.keys().cloned().collect();
        for locus in &loci {
            if !rng.random_bool(rate.clamp(0.0, 1.0)) { continue; }
            let roll: u32 = rng.next_u32() % 4;
            match roll {
                0 => {
                    if let Some(gene) = genome.genes.get(locus) {
                        let gene_dna_len = gene.dna.len();
                        let original = gene.dna.as_slice();
                        let mut new_dna = Vec::with_capacity(gene_dna_len * 3);
                        new_dna.extend_from_slice(original);
                        new_dna.extend_from_slice(original);
                        new_dna.extend_from_slice(original);
                        genome.genes.get_mut(locus).unwrap().dna = DnaStrand::new(new_dna);
                        results.push(MutationResult {
                            scale: MutationScale::Gene,
                            effect: MutationEffect::Amplification { factor: 3 },
                            affected_locus: Some(locus.clone()),
                            positions_changed: gene_dna_len * 2,
                            successful: true,
                            description: format!("Gene amplification of {}", locus),
                        });
                    }
                }
                1 => {
                    if let Some(gene) = genome.genes.get(locus) {
                        let gene_dna_len = gene.dna.len();
                        genome.genes.remove(locus);
                        results.push(MutationResult {
                            scale: MutationScale::Gene,
                            effect: MutationEffect::GeneDeletion,
                            affected_locus: Some(locus.clone()),
                            positions_changed: gene_dna_len,
                            successful: true,
                            description: format!("Gene deletion of {}", locus),
                        });
                    }
                }
                2 => {
                    if let Some(gene) = genome.genes.get(locus) {
                        let gene_dna_len = gene.dna.len();
                        let original = gene.dna.as_slice();
                        let mut new_dna = original.to_vec();
                        new_dna.reverse();
                        genome.genes.get_mut(locus).unwrap().dna = DnaStrand::new(new_dna);
                        results.push(MutationResult {
                            scale: MutationScale::Gene,
                            effect: MutationEffect::Inversion,
                            affected_locus: Some(locus.clone()),
                            positions_changed: gene_dna_len,
                            successful: true,
                            description: format!("Gene inversion of {}", locus),
                        });
                    }
                }
                _ => {
                    if let Some(gene) = genome.genes.get_mut(locus) {
                        gene.is_methylated = !gene.is_methylated;
                        results.push(MutationResult {
                            scale: MutationScale::Gene,
                            effect: MutationEffect::Substitution,
                            affected_locus: Some(locus.clone()),
                            positions_changed: gene.dna.len(),
                            successful: true,
                            description: format!("Gene methylation toggle of {}", locus),
                        });
                    }
                }
            }
        }
        results
    }

    pub fn mutate_segment<R: rand::Rng + ?Sized>(
        strand: &mut DnaStrand,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        let len = strand.len();
        if len < 4 { return results; }
        let segment_len = (len as f64 * rate.clamp(0.0, 1.0)).max(1.0) as usize;
        let start = rng.next_u32() as usize % (len - segment_len + 1);
        let original_segment = strand.as_slice()[start..start + segment_len].to_vec();
        for i in 0..segment_len {
            let pos = start + i;
            let new_nuc = DnaNucleotide::nucleotide_random(rng);
            strand.mutate_point(pos, new_nuc);
        }
        results.push(MutationResult {
            scale: MutationScale::Segment,
            effect: MutationEffect::Substitution,
            affected_locus: None,
            positions_changed: segment_len,
            successful: true,
            description: format!("Segment mutation at {}-{}", start, start + segment_len),
        });
        results
    }

    pub fn mutate_chromosome<R: rand::Rng + ?Sized>(
        genome: &mut Genome,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        let mut rng2 = rng;
        let maternal_results = Self::mutate_nucleotide(&mut genome.chromosome_maternal, rate, &mut rng2);
        let paternal_results = Self::mutate_nucleotide(&mut genome.chromosome_paternal, rate, &mut rng2);
        let total_changed = maternal_results.len() + paternal_results.len();
        results.extend(maternal_results);
        results.extend(paternal_results);
        results.push(MutationResult {
            scale: MutationScale::Chromosome,
            effect: MutationEffect::Substitution,
            affected_locus: None,
            positions_changed: total_changed,
            successful: total_changed > 0,
            description: "Chromosome-level mutation".to_string(),
        });
        results
    }

    pub fn mutate<R: rand::Rng + ?Sized>(
        genome: &mut Genome,
        rates: &MutationRates,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        
        // Nucleotide mutations on chromosomes
        let mut maternal_strand = genome.chromosome_maternal.clone();
        let mut paternal_strand = genome.chromosome_paternal.clone();
        results.extend(Self::mutate_nucleotide(&mut maternal_strand, rates.nucleotide, rng));
        results.extend(Self::mutate_nucleotide(&mut paternal_strand, rates.nucleotide, rng));
        genome.chromosome_maternal = maternal_strand;
        genome.chromosome_paternal = paternal_strand;

        // Gene-level mutations
        results.extend(Self::mutate_gene(genome, rates.gene, rng));

        // Segment mutations
        let mut maternal_strand2 = genome.chromosome_maternal.clone();
        let mut paternal_strand2 = genome.chromosome_paternal.clone();
        results.extend(Self::mutate_segment(&mut maternal_strand2, rates.segment, rng));
        results.extend(Self::mutate_segment(&mut paternal_strand2, rates.segment, rng));
        genome.chromosome_maternal = maternal_strand2;
        genome.chromosome_paternal = paternal_strand2;

        results
    }
}

impl Default for MultiScaleMutator {
    fn default() -> Self { Self::new() }
}
