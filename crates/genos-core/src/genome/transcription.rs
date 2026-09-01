use serde::{Deserialize, Serialize};
use crate::genome::DnaStrand;
use crate::genome::RnaStrand;
use crate::genome::ChromatinState;
use crate::genome::{RnaPolymerase, Ribosome};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Gene {
    /// La canalisation dÃ©veloppementale : Si true, la plasticitÃ© est terminÃ©e, l'Ã©tat Ã©pigÃ©nÃ©tique est irrÃ©versible.
    pub developmentally_locked: bool,
    pub locus: String,
    pub dna: DnaStrand,
    pub is_methylated: bool,
    pub expression_volume: f64,
    pub chromatin_state: ChromatinState,
    // --- NOUVEAU : RÃ©gulation Cellulaire ---
    pub required_activator: Option<String>,
    pub bound_repressor: Option<String>,
    pub default_exons: Vec<(usize, usize)>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Spliceosome;
impl Spliceosome {
    /// Ã‰pissage Alternatif : DÃ©coupe l'ARN prÃ©-messager pour ne garder que les Exons
    pub fn splice(pre_mrna: &RnaStrand, exons: &[(usize, usize)]) -> RnaStrand {
        let mut mature = Vec::new();
        for &(start, end) in exons {
            if start < pre_mrna.sequence.len() {
                let end = std::cmp::min(end, pre_mrna.sequence.len());
                mature.extend_from_slice(&pre_mrna.sequence[start..end]);
            }
        }
        RnaStrand { sequence: mature }
    }
}


impl Gene {
    pub fn new(locus: &str, instruction: &str) -> Self {
        Self {
            locus: locus.to_string(),
            dna: DnaStrand::synthesize(instruction),
            is_methylated: false,
            expression_volume: 1.0,
            chromatin_state: ChromatinState::Euchromatin,
            developmentally_locked: false,
            required_activator: None,
            bound_repressor: None,
            default_exons: Vec::new(),
        }
    }

    pub fn express(
        &self, 
        active_tfs: &[String], 
        alternative_splicing: Option<&[(usize, usize)]>,
        micro_rnas: &[String]
    ) -> Result<String, String> {
        if self.chromatin_state == ChromatinState::HeterochromatinConstitutive || self.chromatin_state == ChromatinState::HeterochromatinFacultative {
            return Err("OFF: L'ADN est trop serre (Heterochromatine)".to_string());
        }

        if let Some(repressor) = &self.bound_repressor {
            if active_tfs.contains(repressor) {
                return Err("OFF: Un Represseur bloque physiquement le gene.".to_string());
            }
        }
        if let Some(activator) = &self.required_activator {
            if !active_tfs.contains(activator) {
                return Err("OFF: En attente de l'Activateur pour demarrer.".to_string());
            }
        }

        let pre_mrna = RnaPolymerase::transcribe(&self.dna);

        let mature_mrna = if let Some(custom_exons) = alternative_splicing {
            Spliceosome::splice(&pre_mrna, custom_exons)
        } else if !self.default_exons.is_empty() {
            Spliceosome::splice(&pre_mrna, &self.default_exons)
        } else {
            pre_mrna
        };

        if micro_rnas.contains(&self.locus) {
            return Err("DETRUIT: Le microARN a detruit l'ARNm.".to_string());
        }

        let protein = Ribosome::translate(&mature_mrna);
        protein.fold()
    }

    pub fn p53_repair_check(&self) -> bool {
        self.express(&[], None, &[]).is_ok()
    }
}




#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Plasmid {
    pub id: Uuid,
    pub instruction: String,
}

