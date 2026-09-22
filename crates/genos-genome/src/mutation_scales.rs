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
                    successful: true,
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
                let new_char = match rng.next_u32() % 4 {
                    0 => 'A', 1 => 'C', 2 => 'G', _ => 'T',
                };
                let mut new_seq = strand.as_slice().to_vec();
                new_seq[pos] = DnaNucleotide::nucleotide_from_char(new_char);
                strand.replace_sequence(new_seq);
                results.push(MutationResult {
                    scale: MutationScale::Codon,
                    effect: MutationEffect::Substitution,
                    affected_locus: None,
                    positions_changed: 1,
                    successful: true,
                    description: format!(
                        "Codon mutation at codon {}: {:?} -> {:?}",
                        i,
                        &original_chars[pos..pos + 3],
                        new_char
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
            if rng.random_bool(rate.clamp(0.0, 1.0)) {
                let roll: u32 = rng.next_u32() % 4;
                match roll {
                    0 => {
                        let gene_dna_len = {
                            genome.genes.get(locus).map(|g| g.dna.len()).unwrap_or(0)
                        };
                        if let Some(gene) = genome.genes.get(locus) {
                            let original = gene.dna.as_str();
                            let mut new_dna = String::with_capacity(original.len() * 3);
                            for _ in 0..3 { new_dna.push_str(&original); }
                            genome.genes.get_mut(locus).unwrap().dna = DnaStrand::synthesize(&new_dna);
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
                        let gene_dna_len = {
                            genome.genes.get(locus).map(|g| g.dna.len()).unwrap_or(0)
                        };
                        if let Some(gene) = genome.genes.get(locus) {
                            let reversed: String = gene.dna.as_str().chars().rev().collect();
                            genome.genes.get_mut(locus).unwrap().dna = DnaStrand::synthesize(&reversed);
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
        }
        results
    }

    pub fn mutate_segment<R: rand::Rng + ?Sized>(
        genome: &mut Genome,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        let loci: Vec<String> = genome
            .genes
            .keys()
            .filter(|l| !l.starts_with("INSTINCT_"))
            .cloned()
            .collect();
        if loci.len() < 2 { return results; }
        if rng.random_bool(rate.clamp(0.0, 1.0)) {
            let src_idx = rng.next_u32() as usize % loci.len();
            let target_idx = rng.next_u32() as usize % loci.len();
            if src_idx == target_idx { return results; }
            let source = loci[src_idx].clone();
            let target = loci[target_idx].clone();
            if let (Some(src_gene), Some(tgt_gene)) =
                (genome.genes.get(&source), genome.genes.get(&target))
            {
                let segment: String = src_gene.dna.as_str().chars().take(3).collect();
                let mut new_tgt: Vec<DnaNucleotide> = tgt_gene.dna.as_slice().to_vec();
                let ins_pos = rng.next_u32() as usize % new_tgt.len().max(1);
                for c in segment.chars().rev() {
                    new_tgt.insert(ins_pos, DnaNucleotide::nucleotide_from_char(c));
                }
                genome.genes.get_mut(&target).unwrap().dna = DnaStrand::synthesize(
                    &new_tgt.iter().map(|n| match n {
                        DnaNucleotide::A => "A",
                        DnaNucleotide::C => "C",
                        DnaNucleotide::G => "G",
                        DnaNucleotide::T => "T",
                    }).collect::<String>(),
                );
                results.push(MutationResult {
                    scale: MutationScale::Segment,
                    effect: MutationEffect::Translocation { target_position: ins_pos },
                    affected_locus: Some(target.clone()),
                    positions_changed: segment.len(),
                    successful: true,
                    description: format!(
                        "Segment translocation from {} -> {} ({} nuc)",
                        source, target, segment.len()
                    ),
                });
            }
        }
        results
    }

    pub fn mutate_chromosome<R: rand::Rng + ?Sized>(
        genome: &mut Genome,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        let is_maternal = rng.random_bool(0.5);
        let strand = if is_maternal {
            &genome.chromosome_maternal
        } else {
            &genome.chromosome_paternal
        };
        let len = strand.len();
        if len < 4 { return results; }
        let start = rng.next_u32() as usize % (len / 2);
        let end = start + 2 + (rng.next_u32() as usize % (len - start - 2));
        let mut seq = strand.as_slice().to_vec();
        seq[start..end].reverse();
        if is_maternal {
            genome.chromosome_maternal.replace_sequence(seq);
        } else {
            genome.chromosome_paternal.replace_sequence(seq);
        }
        results.push(MutationResult {
            scale: MutationScale::Chromosome,
            effect: MutationEffect::Inversion,
            affected_locus: None,
            positions_changed: end - start,
            successful: true,
            description: format!(
                "Chromosomal inversion on {}: {}..{}",
                if is_maternal { "maternal" } else { "paternal" },
                start, end
            ),
        });
        results
    }

    pub fn mutate_genome<R: rand::Rng + ?Sized>(
        genome: &mut Genome,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        if rng.random_bool(rate.clamp(0.0, 1.0)) {
            let breakpoint = genome.chromosome_maternal.len() / 2;
            let is_maternal = rng.random_bool(0.5);
            let strand = if is_maternal {
                &genome.chromosome_maternal
            } else {
                &genome.chromosome_paternal
            };
            let extra: Vec<DnaNucleotide> = strand.as_slice()[..breakpoint].to_vec();
            if is_maternal {
                genome.chromosome_maternal.replace_sequence(
                    genome.chromosome_maternal.as_slice()[breakpoint..].to_vec(),
                );
            } else {
                genome.chromosome_paternal.replace_sequence(
                    genome.chromosome_paternal.as_slice()[breakpoint..].to_vec(),
                );
            }
            genome.extra_chromosomes.push(DnaStrand::synthesize(
                &extra
                    .iter()
                    .map(|n| match n {
                        DnaNucleotide::A => "A",
                        DnaNucleotide::C => "C",
                        DnaNucleotide::G => "G",
                        DnaNucleotide::T => "T",
                    })
                    .collect::<String>(),
            ));
            results.push(MutationResult {
                scale: MutationScale::Genome,
                effect: MutationEffect::Fission { breakpoint },
                affected_locus: None,
                positions_changed: breakpoint,
                successful: true,
                description: format!(
                    "Chromosome fission on {} at breakpoint {}",
                    if is_maternal { "maternal" } else { "paternal" },
                    breakpoint
                ),
            });
        }
        results
    }

    pub fn mutate_intergenomic<R: rand::Rng + ?Sized>(
        genome: &mut Genome,
        rate: f64,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        if rate <= 0.0 { return results; }
        if genome.extra_chromosomes.is_empty() { return results; }
        let idx = rng.next_u32() as usize % genome.extra_chromosomes.len();
        let extra = genome.extra_chromosomes.remove(idx);
        let is_maternal = rng.random_bool(0.5);
        if is_maternal {
            let mut new_seq = genome.chromosome_maternal.as_slice().to_vec();
            new_seq.extend(extra.as_slice().iter().cloned());
            genome.chromosome_maternal.replace_sequence(new_seq);
        } else {
            let mut new_seq = genome.chromosome_paternal.as_slice().to_vec();
            new_seq.extend(extra.as_slice().iter().cloned());
            genome.chromosome_paternal.replace_sequence(new_seq);
        }
        results.push(MutationResult {
            scale: MutationScale::Intergenomic,
            effect: MutationEffect::Fusion,
            affected_locus: None,
            positions_changed: extra.len(),
            successful: true,
            description: format!(
                "Intergenomic fusion into {} ({} nuc)",
                if is_maternal { "maternal" } else { "paternal" },
                extra.len()
            ),
        });
        results
    }

    pub fn mutate_multi_scale<R: rand::Rng + ?Sized>(
        genome: &mut Genome,
        rates: &MutationRates,
        rng: &mut R,
    ) -> Vec<MutationResult> {
        let mut results = Vec::new();
        for strand in [&mut genome.chromosome_maternal, &mut genome.chromosome_paternal] {
            results.extend(Self::mutate_nucleotide(strand, rates.nucleotide, rng));
            results.extend(Self::mutate_codon(strand, rates.codon, rng));
        }
        results.extend(Self::mutate_gene(genome, rates.gene, rng));
        results.extend(Self::mutate_segment(genome, rates.segment, rng));
        results.extend(Self::mutate_chromosome(genome, rates.chromosome, rng));
        results.extend(Self::mutate_genome(genome, rates.genome, rng));
        results
    }
}

impl Default for MultiScaleMutator {
    fn default() -> Self { Self::new() }
}

#[path = "mutation_scales_tests.rs"]
mod tests;