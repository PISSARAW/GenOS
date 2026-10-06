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

    pub fn express(&self, ctx: ExpressionContext) -> Result<String, String> {
        Gene::new(&format!("PLASMID_{}", self.id), &self.instruction).express(ctx)
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

    fn is_silenced(&self) -> bool {
        match self.is_methylated {
            true => true,
            false => self.expression_volume <= 0.0,
        }
    }

    fn is_constitutive_locked(&self) -> bool {
        match self.chromatin_state {
            ChromatinState::HeterochromatinConstitutive => true,
            _ => false,
        }
    }

    fn is_condensed(&self) -> bool {
        match self.chromatin_state {
            ChromatinState::HeterochromatinFacultative => true,
            _ => self.developmentally_locked,
        }
    }

    fn tf_matches_pioneer(tf: &str, pioneer_locus: &str, locus: &str) -> bool {
        match tf == "PIONEER_FACTOR" {
            true => true,
            false => match tf == pioneer_locus {
                true => true,
                false => match tf.strip_prefix("PIONEER_") {
                    None => false,
                    Some(_) => tf.ends_with(locus),
                },
            },
        }
    }

    fn pioneer_present(&self, active_tfs: &[String]) -> bool {
        let pioneer_locus = format!("PIONEER_{}", self.locus);
        for tf in active_tfs {
            match Self::tf_matches_pioneer(tf, &pioneer_locus, &self.locus) {
                true => return true,
                false => {},
            }
        }
        false
    }

    fn check_condensation(&self, ctx: &ExpressionContext) -> Result<(), String> {
        match self.is_condensed() {
            false => Ok(()),
            true => match self.pioneer_present(ctx.active_tfs) {
                true => Ok(()),
                false => Err("OFF: Heterochromatin locked".to_string()),
            },
        }
    }

    fn check_repressor(&self, ctx: &ExpressionContext) -> Result<(), String> {
        match &self.bound_repressor {
            None => Ok(()),
            Some(rep) => match ctx.active_tfs.contains(rep) {
                true => Err("OFF: Repressor bound".to_string()),
                false => Ok(()),
            },
        }
    }

    fn check_activator(&self, ctx: &ExpressionContext) -> Result<(), String> {
        match &self.required_activator {
            None => Ok(()),
            Some(act) => match ctx.active_tfs.contains(act) {
                true => Ok(()),
                false => Err("OFF: Missing required activator".to_string()),
            },
        }
    }

    fn mature_transcript(&self, pre_mrna: RnaStrand, ctx: &ExpressionContext) -> RnaStrand {
        match ctx.alternative_splicing {
            Some(custom_exons) => Spliceosome::splice(&pre_mrna, custom_exons),
            None => match self.default_exons.is_empty() {
                true => pre_mrna,
                false => Spliceosome::splice(&pre_mrna, &self.default_exons),
            },
        }
    }

    fn check_mirna(&self, ctx: &ExpressionContext) -> Result<(), String> {
        match ctx.micro_rnas.contains(&self.locus) {
            true => Err("DESTROYED: microRNA targeted decay".to_string()),
            false => Ok(()),
        }
    }

    pub fn express(&self, ctx: ExpressionContext) -> Result<String, String> {
        if self.is_silenced() {
            return Err("OFF: Gene silenced".to_string());
        }
        if self.is_constitutive_locked() {
            return Err("OFF: Heterochromatin locked".to_string());
        }
        self.check_condensation(&ctx)?;
        self.check_repressor(&ctx)?;
        self.check_activator(&ctx)?;

        let pre_mrna = RnaPolymerase::transcribe(&self.dna);
        let mature_mrna = self.mature_transcript(pre_mrna, &ctx);
        self.check_mirna(&ctx)?;

        Ribosome::quality_control_nmd(&mature_mrna, false)?;
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

#[cfg(test)]
mod plasmid_tests {
    use super::{ExpressionContext, Plasmid};

    #[test]
    fn plasmid_expression_uses_the_gene_regulation_pipeline() {
        let plasmid = Plasmid::new("ATG_GENE");
        let empty_tfs = Vec::new();
        let empty_rnas = Vec::new();
        assert!(plasmid
            .express(ExpressionContext {
                active_tfs: &empty_tfs,
                alternative_splicing: None,
                micro_rnas: &empty_rnas,
            })
            .is_ok());
    }
}
