use crate::dna::DnaStrand;
use crate::gene::{ChromatinState, Gene, Plasmid};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fmt::Write;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Genome {
    pub genome_id: Uuid,
    pub lineage_id: Uuid,
    pub chromosome_maternal: DnaStrand,
    pub chromosome_paternal: DnaStrand,
    pub genes: BTreeMap<String, Gene>,
    pub plasmids: Vec<Plasmid>,
    pub endogenous_retroviruses: Vec<Gene>,
    pub regulatory_enhancers: Vec<String>,
    pub extra_chromosomes: Vec<DnaStrand>,
}

impl Genome {
    pub fn new(base_instruction: &str) -> Self {
        let id = Uuid::new_v4();
        let strand = DnaStrand::synthesize(base_instruction);
        Self {
            genome_id: id,
            lineage_id: id,
            chromosome_maternal: strand.clone(),
            chromosome_paternal: strand,
            genes: BTreeMap::new(),
            plasmids: Vec::new(),
            endogenous_retroviruses: Vec::new(),
            regulatory_enhancers: Vec::new(),
            extra_chromosomes: Vec::new(),
        }
    }

    pub fn insert_gene(&mut self, gene: Gene) {
        self.genes.insert(gene.locus.clone(), gene);
    }

    pub fn crispr_cas9_knockout(&mut self, target_locus: &str) -> bool {
        self.genes.remove(target_locus).is_some()
    }

    pub fn pseudogenize(&mut self, target_locus: &str) -> bool {
        if let Some(gene) = self.genes.get_mut(target_locus) {
            gene.required_activator = Some("BROKEN_PROMOTER".to_string());
            gene.is_methylated = true;
            gene.chromatin_state = ChromatinState::HeterochromatinConstitutive;
            true
        } else {
            false
        }
    }

    pub fn duplicate_gene(&mut self, target_locus: &str) -> Result<String, String> {
        if let Some(original) = self.genes.get(target_locus) {
            let mut duplicate = original.clone();
            let new_locus = format!("{}_COPY_{}", target_locus, self.genes.len());
            duplicate.locus = new_locus.clone();
            self.genes.insert(new_locus.clone(), duplicate);
            Ok(new_locus)
        } else {
            Err("Target gene not found".to_string())
        }
    }

    pub fn repair_double_strand_break(&mut self, is_maternal_broken: bool, range: std::ops::Range<usize>) {
        let start = range.start;
        let len = range.len();
        let source = if is_maternal_broken {
            &self.chromosome_paternal
        } else {
            &self.chromosome_maternal
        };
        if start + len <= source.sequence.len() {
            let chunk = source.sequence[start..start + len].to_vec();
            let target = if is_maternal_broken {
                &mut self.chromosome_maternal
            } else {
                &mut self.chromosome_paternal
            };
            if start <= target.sequence.len() {
                let tail = target.sequence.split_off(start);
                target.sequence.extend(chunk);
                target.sequence.extend(tail);
            }
        }
    }

    pub fn hash_library(&self) -> String {
        let serialized = serde_json::to_string(self).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        let mut hex = String::with_capacity(64);
        for byte in hasher.finalize() {
            write!(&mut hex, "{:02x}", byte).unwrap();
        }
        hex
    }
}
