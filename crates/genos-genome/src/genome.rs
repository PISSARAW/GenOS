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

fn default_ploidy() -> String {
    "diploid".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Genome {
    genome_id: Uuid,
    lineage_id: Uuid,
    #[serde(default)]
    pub parent_ids: Vec<Uuid>,
    #[serde(default)]
    pub generation: u32,
    #[serde(default = "default_ploidy")]
    pub ploidy: String,
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

    pub fn can_replicate(&self) -> bool {
        self.can_bud()
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
        let parent_id = self.genome_id;
        child.genome_id = Uuid::new_v4();
        child.parent_ids = vec![parent_id];
        child.generation = self.generation.saturating_add(1);
        child.bud_scars.clear();
        child
    }

    pub fn derive_reproductive_child(&self) -> Self {
        let mut child = self.derive_child();
        for gene in child.genes.values_mut() {
            if gene.chromatin_state == ChromatinState::HeterochromatinFacultative {
                gene.chromatin_state = ChromatinState::Euchromatin;
                gene.is_methylated = false;
                gene.developmentally_locked = false;
                gene.bound_repressor = None;
                gene.expression_volume = 1.0;
            }
        }
        child
    }

    pub fn mutate_stochastic<R: rand::Rng + ?Sized>(&mut self, rate: f64, rng: &mut R) -> usize {
        if rate <= 0.0 { return 0; }
        let mut count = 0;
        count += self.chromosome_maternal.mutate_stochastic(rate, rng);
        count += self.chromosome_paternal.mutate_stochastic(rate, rng);
        for gene in self.genes.values_mut() {
            count += gene.dna.mutate_stochastic(rate, rng);
        }
        count
    }

    pub fn hypermutate<R: rand::Rng + ?Sized>(&mut self, rate: f64, rng: &mut R) -> usize {
        if !rate.is_finite() || rate <= 0.0 {
            return 0;
        }
        let accelerated = (rate * 3.0).min(0.95);
        self.mutate_stochastic(accelerated, rng)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.genome_id == Uuid::nil() { return Err("genome_id must not be nil".into()); }
        if self.lineage_id == Uuid::nil() { return Err("lineage_id must not be nil".into()); }
        if self.chromosome_maternal.is_empty() || self.chromosome_paternal.is_empty() {
            return Err("chromosomes must not be empty".into());
        }
        for (key, gene) in &self.genes {
            if key.trim().is_empty() || gene.locus.trim().is_empty() || gene.dna.is_empty() {
                return Err(format!("gene '{key}' has an invalid locus or empty DNA"));
            }
            if key != &gene.locus { return Err(format!("gene map key does not match locus '{key}'")); }
            for &(start, end) in &gene.default_exons {
                if start >= end || end > gene.dna.len() {
                    return Err(format!("gene '{key}' has an invalid exon range"));
                }
            }
        }
        for plasmid in &self.plasmids {
            if plasmid.id == Uuid::nil() || plasmid.instruction.trim().is_empty() {
                return Err("plasmids must have a non-nil id and non-empty instruction".into());
            }
        }
        for chromosome in &self.extra_chromosomes {
            if chromosome.is_empty() { return Err("extra chromosomes must not be empty".into()); }
        }
        Ok(())
    }

    pub fn fingerprint(&self) -> Result<GenomeFingerprint, String> {
        self.validate()?;
        Ok(GenomeFingerprint { genome_id: self.genome_id, lineage_id: self.lineage_id, hash: self.try_hash_library()?, content_hash: self.content_hash() })
    }

    pub fn verify_fingerprint(&self, fingerprint: &GenomeFingerprint) -> bool {
        self.genome_id == fingerprint.genome_id
            && self.lineage_id == fingerprint.lineage_id
            && self.try_hash_library().map(|hash| hash == fingerprint.hash).unwrap_or(false)
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
            "extra_chromosomes": &self.extra_chromosomes,
            "ploidy": &self.ploidy
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
            parent_ids: Vec::new(),
            generation: 0,
            ploidy: default_ploidy(),
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
        self.try_hash_library().expect("Genome serialization must be infallible for a valid Genome")
    }

    pub fn try_hash_library(&self) -> Result<String, String> {
        let serialized = serde_json::to_string(self).map_err(|error| format!("Genome serialization failed: {error}"))?;
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        let mut hex = String::with_capacity(64);
        for byte in hasher.finalize() {
            write!(&mut hex, "{:02x}", byte).unwrap();
        }
        Ok(hex)
    }
}

#[cfg(test)]
#[path = "genome_tests.rs"]
mod tests;

