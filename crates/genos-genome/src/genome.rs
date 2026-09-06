use crate::dna::DnaStrand;
use crate::gene::{ChromatinState, Gene, Plasmid};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fmt::Write;
use uuid::Uuid;

pub const DEFAULT_HAYFLICK_LIMIT: u32 = 5;

fn default_hayflick_limit() -> u32 {
    DEFAULT_HAYFLICK_LIMIT
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Genome {
    genome_id: Uuid,
    lineage_id: Uuid,
    pub chromosome_maternal: DnaStrand,
    pub chromosome_paternal: DnaStrand,
    pub genes: BTreeMap<String, Gene>,
    pub plasmids: Vec<Plasmid>,
    pub endogenous_retroviruses: Vec<Gene>,
    pub regulatory_enhancers: Vec<String>,
    pub extra_chromosomes: Vec<DnaStrand>,
    #[serde(default)]
    pub bud_scars: Vec<Uuid>,
    #[serde(default = "default_hayflick_limit")]
    pub hayflick_limit: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct YamanakaCocktail {
    pub chromatin_decondensation_rate: f64,
    pub synaptic_retention_ratio: f64,
    pub target_potency: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct GenomeFingerprint {
    pub genome_id: Uuid,
    pub lineage_id: Uuid,
    pub hash: String,
    pub content_hash: String,
}

impl Genome {
    pub fn genome_id(&self) -> Uuid { self.genome_id }

    pub fn lineage_id(&self) -> Uuid { self.lineage_id }

    pub fn can_bud(&self) -> bool {
        (self.bud_scars.len() as u32) < self.hayflick_limit
    }

    pub fn add_bud_scar(&mut self, daughter_id: Uuid) -> Result<(), String> {
        if !self.can_bud() {
            return Err(format!(
                "Hayflick limit reached: mother cell is senescent ({} >= {})",
                self.bud_scars.len(),
                self.hayflick_limit
            ));
        }
        self.bud_scars.push(daughter_id);
        Ok(())
    }

    pub fn derive_child(&self) -> Self {
        let mut child = self.clone();
        child.genome_id = Uuid::new_v4();
        child.bud_scars.clear();
        child
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.genome_id == Uuid::nil() { return Err("genome_id must not be nil".into()); }
        if self.lineage_id == Uuid::nil() { return Err("lineage_id must not be nil".into()); }
        for (key, gene) in &self.genes {
            if key != &gene.locus { return Err(format!("gene map key does not match locus '{key}'")); }
        }
        Ok(())
    }

    pub fn fingerprint(&self) -> Result<GenomeFingerprint, String> {
        self.validate()?;
        Ok(GenomeFingerprint { genome_id: self.genome_id, lineage_id: self.lineage_id, hash: self.hash_library(), content_hash: self.content_hash() })
    }

    pub fn verify_fingerprint(&self, fingerprint: &GenomeFingerprint) -> bool {
        self.genome_id == fingerprint.genome_id
            && self.lineage_id == fingerprint.lineage_id
            && self.hash_library() == fingerprint.hash
            && self.content_hash() == fingerprint.content_hash
    }

    pub fn content_hash(&self) -> String {
        let content = serde_json::json!({
            "chromosome_maternal": &self.chromosome_maternal,
            "chromosome_paternal": &self.chromosome_paternal,
            "genes": &self.genes,
            "plasmids": &self.plasmids,
            "endogenous_retroviruses": &self.endogenous_retroviruses,
            "regulatory_enhancers": &self.regulatory_enhancers,
            "extra_chromosomes": &self.extra_chromosomes
        });
        let mut hasher = Sha256::new();
        hasher.update(serde_json::to_vec(&content).unwrap_or_default());
        hasher.finalize().iter().map(|byte| format!("{byte:02x}")).collect()
    }

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
            bud_scars: Vec::new(),
            hayflick_limit: DEFAULT_HAYFLICK_LIMIT,
        }
    }

    pub fn insert_gene(&mut self, gene: Gene) {
        self.genes.insert(gene.locus.clone(), gene);
    }

    pub fn reprogram_epigenetics(&mut self, _cocktail: &YamanakaCocktail) {
        let cocktail = _cocktail;
        let decondensation = cocktail.chromatin_decondensation_rate.clamp(0.0, 1.0);
        for gene in self.genes.values_mut() {
            if gene.chromatin_state == ChromatinState::HeterochromatinFacultative {
                if decondensation > 0.0 {
                    gene.chromatin_state = ChromatinState::Euchromatin;
                    gene.developmentally_locked = false;
                    gene.is_methylated = false;
                    gene.bound_repressor = None;
                    gene.expression_volume = decondensation;
                }
            }
        }
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
        if start + len <= source.len() {
            let chunk = source.as_slice()[start..start + len].to_vec();
            let target = if is_maternal_broken {
                &mut self.chromosome_maternal
            } else {
                &mut self.chromosome_paternal
            };
            if start + len <= target.len() {
                let mut sequence = target.as_slice().to_vec();
                sequence.splice(start..start + len, chunk);
                target.replace_sequence(sequence);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gene::Gene;

    #[test]
    fn test_yamanaka_reprogramming() {
        let mut genome = Genome::new("ATGC");
        
        let mut gene1 = Gene::new("HOX_A1", "ATGC");
        gene1.chromatin_state = ChromatinState::HeterochromatinFacultative;
        gene1.developmentally_locked = true;
        gene1.is_methylated = true;
        
        let mut gene2 = Gene::new("HOUSEKEEPING_1", "ATGC");
        gene2.chromatin_state = ChromatinState::Euchromatin;
        gene2.developmentally_locked = false;
        gene2.is_methylated = false;
        
        let mut gene3 = Gene::new("VIRAL_INSERT", "ATGC");
        gene3.chromatin_state = ChromatinState::HeterochromatinConstitutive;
        gene3.developmentally_locked = true;
        gene3.is_methylated = true;
        
        genome.insert_gene(gene1);
        genome.insert_gene(gene2);
        genome.insert_gene(gene3);
        
        let cocktail = YamanakaCocktail {
            chromatin_decondensation_rate: 1.0,
            synaptic_retention_ratio: 0.9,
            target_potency: "Pluripotent".to_string(),
        };
        
        genome.reprogram_epigenetics(&cocktail);
        
        // gene1 (Facultative) should be reprogrammed
        let g1 = genome.genes.get("HOX_A1").unwrap();
        assert_eq!(g1.chromatin_state, ChromatinState::Euchromatin);
        assert_eq!(g1.developmentally_locked, false);
        assert_eq!(g1.is_methylated, false);
        
        // gene2 (Euchromatin) should be untouched
        let g2 = genome.genes.get("HOUSEKEEPING_1").unwrap();
        assert_eq!(g2.chromatin_state, ChromatinState::Euchromatin);
        assert_eq!(g2.developmentally_locked, false);
        assert_eq!(g2.is_methylated, false);
        
        // gene3 (Constitutive) should be untouched
        let g3 = genome.genes.get("VIRAL_INSERT").unwrap();
        assert_eq!(g3.chromatin_state, ChromatinState::HeterochromatinConstitutive);
        assert_eq!(g3.developmentally_locked, true);
        assert_eq!(g3.is_methylated, true);
    }

    #[test]
    fn test_double_strand_repair_replaces_the_broken_region() {
        let mut genome = Genome::new("REPAIR");
        genome.chromosome_maternal.replace_sequence(vec![
            crate::dna::DnaNucleotide::A,
            crate::dna::DnaNucleotide::A,
            crate::dna::DnaNucleotide::A,
            crate::dna::DnaNucleotide::A,
        ]);
        genome.chromosome_paternal.replace_sequence(vec![
            crate::dna::DnaNucleotide::C,
            crate::dna::DnaNucleotide::G,
            crate::dna::DnaNucleotide::T,
            crate::dna::DnaNucleotide::C,
        ]);
        genome.repair_double_strand_break(true, 1..3);
        assert_eq!(
            genome.chromosome_maternal.as_slice(),
            vec![
                crate::dna::DnaNucleotide::A,
                crate::dna::DnaNucleotide::G,
                crate::dna::DnaNucleotide::T,
                crate::dna::DnaNucleotide::A,
            ]
        );
    }

    #[test]
    fn test_fingerprint_detects_genome_mutation() {
        let mut genome = Genome::new("IMMUTABLE");
        let fingerprint = genome.fingerprint().unwrap();
        assert!(genome.verify_fingerprint(&fingerprint));
        genome.insert_gene(Gene::new("MUTATED", "ATGC"));
        assert!(!genome.verify_fingerprint(&fingerprint));
    }

    #[test]
    fn test_content_hash_ignores_identity_but_detects_content() {
        let genome = Genome::new("CONTENT");
        let child = genome.derive_child();
        assert_eq!(genome.content_hash(), child.content_hash());
        assert_ne!(genome.genome_id(), child.genome_id());
    }
}
