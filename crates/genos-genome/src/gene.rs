use crate::dna::{DnaStrand, RnaPolymerase, RnaStrand};
use crate::translation::Ribosome;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum ChromatinState {
    Euchromatin,
    HeterochromatinConstitutive,
    HeterochromatinFacultative,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Plasmid {
    pub id: Uuid,
    pub instruction: String,
}

impl Plasmid {
    pub fn new(instruction: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            instruction: instruction.to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Spliceosome;

impl Spliceosome {
    pub fn splice(pre_mrna: &RnaStrand, exons: &[(usize, usize)]) -> RnaStrand {
        let mut mature = Vec::new();
        let mut ejcs = Vec::new();
        let mut previous_end = 0;
        for &(start, end) in exons {
            if start >= end || start < previous_end || end > pre_mrna.sequence.len() {
                continue;
            }
            mature.extend_from_slice(&pre_mrna.sequence[start..end]);
            previous_end = end;
            ejcs.push(mature.len());
        }
        if !ejcs.is_empty() {
            ejcs.pop();
        }
        RnaStrand {
            sequence: mature,
            ejc_positions: ejcs,
        }
    }
}

pub struct ExpressionContext<'a> {
    pub active_tfs: &'a [String],
    pub alternative_splicing: Option<&'a [(usize, usize)]>,
    pub micro_rnas: &'a [String],
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Gene {
    pub locus: String,
    pub dna: DnaStrand,
    pub is_methylated: bool,
    pub expression_volume: f64,
    pub chromatin_state: ChromatinState,
    pub developmentally_locked: bool,
    pub required_activator: Option<String>,
    pub bound_repressor: Option<String>,
    pub default_exons: Vec<(usize, usize)>,
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

    pub fn express(&self, ctx: ExpressionContext) -> Result<String, String> {
        if self.is_methylated || self.expression_volume <= 0.0 {
            return Err("OFF: Gene silenced".to_string());
        }
        if self.chromatin_state != ChromatinState::Euchromatin || self.developmentally_locked {
            return Err("OFF: Heterochromatin locked".to_string());
        }
        if let Some(rep) = &self.bound_repressor {
            if ctx.active_tfs.contains(rep) {
                return Err("OFF: Repressor bound".to_string());
            }
        }
        if let Some(act) = &self.required_activator {
            if !ctx.active_tfs.contains(act) {
                return Err("OFF: Missing required activator".to_string());
            }
        }

        let pre_mrna = RnaPolymerase::transcribe(&self.dna);
        let mature_mrna = if let Some(custom_exons) = ctx.alternative_splicing {
            Spliceosome::splice(&pre_mrna, custom_exons)
        } else if !self.default_exons.is_empty() {
            Spliceosome::splice(&pre_mrna, &self.default_exons)
        } else {
            pre_mrna
        };

        if ctx.micro_rnas.contains(&self.locus) {
            return Err("DESTROYED: microRNA targeted decay".to_string());
        }

        let protein = Ribosome::translate(&mature_mrna);
        protein.fold()
    }

    pub fn p53_repair_check(&self) -> bool {
        let empty_tfs: Vec<String> = Vec::new();
        let empty_rnas: Vec<String> = Vec::new();
        self.express(ExpressionContext {
            active_tfs: &empty_tfs,
            alternative_splicing: None,
            micro_rnas: &empty_rnas,
        })
        .is_ok()
    }
}
