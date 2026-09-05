use genos_genome::{DnaStrand, Gene};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Virion {
    pub genome: DnaStrand,
    pub capsid_integrity: f64,
    pub envelope_spike: String,
    pub is_lytic: bool,
    pub is_neutralized: bool,
    pub is_opsonized: bool,
    pub is_agglutinated: bool,
}

impl Virion {
    pub fn new_bacteriophage(target_receptor: &str, kill_instruction: &str) -> Self {
        Self {
            genome: DnaStrand::synthesize(kill_instruction),
            capsid_integrity: 1.0,
            envelope_spike: target_receptor.to_string(),
            is_lytic: true,
            is_neutralized: false,
            is_opsonized: false,
            is_agglutinated: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Retrovirus {
    pub rna_sequence: String,
    pub capsid_integrity: f64,
    pub envelope_spike: String,
}

impl Retrovirus {
    pub fn new(spike: &str, rna_sequence: &str) -> Self {
        Self {
            rna_sequence: rna_sequence.to_string(),
            capsid_integrity: 1.0,
            envelope_spike: spike.to_string(),
        }
    }

    pub fn reverse_transcribe(&self) -> DnaStrand {
        DnaStrand::synthesize(&self.rna_sequence)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Bacteriophage {
    pub viral_dna: DnaStrand,
    pub stolen_cargo: Option<Gene>,
    pub is_specialized: bool,
}

impl Bacteriophage {
    pub fn new(viral_instruction: &str) -> Self {
        Self {
            viral_dna: DnaStrand::synthesize(viral_instruction),
            stolen_cargo: None,
            is_specialized: false,
        }
    }

    pub fn packaging_error_generalized(&mut self, random_host_gene: Gene) {
        self.stolen_cargo = Some(random_host_gene);
        self.is_specialized = false;
    }

    pub fn packaging_error_specialized(&mut self, adjacent_host_gene: Gene) {
        self.stolen_cargo = Some(adjacent_host_gene);
        self.is_specialized = true;
    }
}
