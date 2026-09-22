use crate::genome::Genome;
use crate::gene::Gene;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum EpistasisType {
    Additive,
    Dominance,
    Recessive,
    Overdominance,
    Underdominance,
    Complementary,
    Duplicate,
    Inhibitory,
    SyntheticLethal,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct LinkageGroup {
    pub loci: Vec<String>,
    pub recombination_rate: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EpistasisInteraction {
    pub locus_a: String,
    pub locus_b: String,
    pub interaction_type: EpistasisType,
    pub strength: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct LinkageResult {
    pub group_id: usize,
    pub loci: Vec<String>,
    pub recombination_rate: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EpistasisResult {
    pub locus_a: String,
    pub locus_b: String,
    pub epistasis_type: EpistasisType,
    pub combined_effect: f64,
    pub individual_effect_a: f64,
    pub individual_effect_b: f64,
}

pub struct LinkageEpistasisEngine;

impl LinkageEpistasisEngine {
    pub fn new() -> Self { Self }

    pub fn compute_linkage_groups(genome: &Genome) -> Vec<LinkageResult> {
        Self::compute_linkage_groups_with_threshold(genome, 0.5)
    }

    pub fn compute_linkage_groups_with_threshold(
        genome: &Genome,
        recombination_threshold: f64,
    ) -> Vec<LinkageResult> {
        let loci: Vec<String> = genome.genes.keys().cloned().collect();
        if loci.is_empty() { return Vec::new(); }
        let mut groups: Vec<LinkageResult> = Vec::new();
        let mut assigned: BTreeMap<String, usize> = BTreeMap::new();
        let mut next_id = 0usize;
        for locus in &loci {
            if !assigned.contains_key(locus) {
                let mut group_loci = vec![locus.clone()];
                assigned.insert(locus.clone(), next_id);
                for other in &loci {
                    if locus == other { continue; }
                    let rate = Self::estimate_recombination(genome, locus, other);
                    if rate < recombination_threshold {
                        group_loci.push(other.clone());
                        assigned.insert(other.clone(), next_id);
                    }
                }
                groups.push(LinkageResult {
                    group_id: next_id,
                    loci: group_loci,
                    recombination_rate: 0.0,
                });
                next_id += 1;
            }
        }
        groups
    }

    pub fn compute_epistasis(
        genome: &Genome,
        effects: &BTreeMap<String, f64>,
    ) -> Vec<EpistasisResult> {
        let loci: Vec<String> = genome.genes.keys().cloned().collect();
        let mut results = Vec::new();
        for i in 0..loci.len() {
            for j in (i + 1)..loci.len() {
                let a = &loci[i];
                let b = &loci[j];
                let ea = effects.get(a).copied().unwrap_or(0.0);
                let eb = effects.get(b).copied().unwrap_or(0.0);
                let interaction = Self::classify_epistasis(ea, eb);
                let combined = ea + eb + interaction.strength * ea * eb;
                results.push(EpistasisResult {
                    locus_a: a.clone(),
                    locus_b: b.clone(),
                    epistasis_type: interaction.interaction_type,
                    combined_effect: combined,
                    individual_effect_a: ea,
                    individual_effect_b: eb,
                });
            }
        }
        results
    }

    pub fn recombination_fraction(
        genome: &Genome,
        locus_a: &str,
        locus_b: &str,
    ) -> f64 {
        Self::estimate_recombination(genome, locus_a, locus_b)
    }

    fn estimate_recombination(
        genome: &Genome,
        locus_a: &str,
        locus_b: &str,
    ) -> f64 {
        let a_idx = genome.genes.get(locus_a).map(|g| g.dna.len()).unwrap_or(0);
        let b_idx = genome.genes.get(locus_b).map(|g| g.dna.len()).unwrap_or(0);
        let dist = (a_idx as i64 - b_idx as i64).unsigned_abs();
        let chrom_len = genome.chromosome_maternal.len().max(1);
        (dist as f64).min(chrom_len as f64) / chrom_len as f64
    }

    fn classify_epistasis(ea: f64, eb: f64) -> EpistasisInteraction {
        let sum = ea + eb;
        let product = ea * eb;
        if product == 0.0 {
            return EpistasisInteraction {
                locus_a: String::new(),
                locus_b: String::new(),
                interaction_type: EpistasisType::Additive,
                strength: 0.0,
            };
        }
        let ratio = sum / product;
        let interaction_type = if ratio > 2.0 {
            EpistasisType::Duplicate
        } else if ratio < 0.5 {
            EpistasisType::Inhibitory
        } else if (ratio - 1.0).abs() < 0.1 {
            EpistasisType::Complementary
        } else if ea.abs() > eb.abs() * 2.0 {
            EpistasisType::Dominance
        } else if eb.abs() > ea.abs() * 2.0 {
            EpistasisType::Recessive
        } else {
            EpistasisType::Additive
        };
        let strength = (sum - product).clamp(-1.0, 1.0);
        EpistasisInteraction {
            locus_a: String::new(),
            locus_b: String::new(),
            interaction_type,
            strength,
        }
    }
}

impl Default for LinkageEpistasisEngine {
    fn default() -> Self { Self::new() }
}