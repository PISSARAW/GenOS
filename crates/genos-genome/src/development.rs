use crate::epigenome::{DevelopmentalStage, Epigenome, EpigeneticMark};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Embryogenesis engine ───────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EmbryogenesisContext {
    pub signals: Vec<DevelopmentalSignal>,
    pub morphogens: Vec<MorphogenGradient>,
    pub energy_budget: f64,
    pub time_step: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum DevelopmentalSignal {
    PathwayActivation { pathway: String, magnitude: f64 },
    GeneKnockdown { target_locus: String, reduction: f64 },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MorphogenGradient {
    pub name: String,
    pub concentration: f64,
    pub source_locus: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EmbryogenesisProgram {
    pub expressed_lineage: Option<String>,
    pub gene_expression_profile: HashMap<String, f64>,
    pub epigenetic_landscape: HashMap<String, f64>,
}

impl EmbryogenesisProgram {
    pub fn default_program() -> Self {
        Self {
            expressed_lineage: Some("UNCOMMITTED".to_string()),
            gene_expression_profile: HashMap::new(),
            epigenetic_landscape: HashMap::new(),
        }
    }
}

pub struct Embryogenesis;

impl Embryogenesis {
    pub fn compute_program(
        _genome: &crate::genome::Genome,
        epigenome: &Epigenome,
        ctx: &EmbryogenesisContext,
    ) -> EmbryogenesisProgram {
        let mut program = EmbryogenesisProgram::default_program();
        let morphogen_field: HashMap<String, f64> = ctx
            .morphogens
            .iter()
            .map(|m| (m.name.clone(), m.concentration))
            .collect();
        program.expressed_lineage = dominant_morphogen(&morphogen_field);
        for signal in &ctx.signals {
            match signal {
                DevelopmentalSignal::PathwayActivation { pathway, magnitude } => {
                    program.gene_expression_profile.entry(pathway.clone()).or_insert(0.0);
                    *program.gene_expression_profile.get_mut(pathway).unwrap() += magnitude;
                }
                DevelopmentalSignal::GeneKnockdown { target_locus, reduction } => {
                    program.gene_expression_profile.entry(target_locus.clone()).or_insert(1.0);
                    *program.gene_expression_profile.get_mut(target_locus).unwrap() -= reduction;
                }
            }
        }
        let blocks: Vec<String> = epigenome
            .marks
            .iter()
            .filter(|(_, m)| matches!(m.kind, EpigeneticMark::Methylation) && m.level > 0.7)
            .map(|(l, _)| l.clone())
            .collect();
        if let Some(ref lineage) = program.expressed_lineage {
            if blocks.iter().any(|b| b.to_uppercase().contains(&lineage.to_uppercase())) {
                program.expressed_lineage = Some("BIPOTENT_UNCOMMITTED".to_string());
            }
        }
        for (locus, mark) in &epigenome.marks {
            program.epigenetic_landscape.insert(locus.clone(), mark.level);
        }
        if epigenome.stage != DevelopmentalStage::Zygote {
            program.gene_expression_profile.entry("STAGE_SPECIFIC".to_string()).or_insert(0.0);
            *program.gene_expression_profile.get_mut("STAGE_SPECIFIC").unwrap() += 0.3;
        }
        program
    }
}

fn dominant_morphogen(field: &HashMap<String, f64>) -> Option<String> {
    field.iter().max_by(|a, b| a.1.partial_cmp(b.1).unwrap()).map(|(n, _)| n.to_uppercase())
}

// ── Compatibility types ─────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum CellLineage { Neural, Mesoderm, Endoderm, Ectoderm, Germline }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentalState {
    pub lineage: Option<CellLineage>,
    pub stage: DevelopmentalStage,
    pub differentiation_index: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum GeneRoleExpr { Constitutive, DevelopmentallyActivated {} }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GeneRoleProfile {
    pub gene_ref: String,
    pub role_expr: GeneRoleExpr,
    pub active_conditions: Vec<String>,
    pub epigenetic_marks: Vec<EpigeneticMarkActivation>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EpigeneticMarkActivation {
    pub mark_type: String,
    pub level: f64,
    pub condition: String,
    pub timing: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Morphogen { pub name: String, pub concentration: f64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MorphogenDef { pub name: String, pub source: String, pub sink: String, pub diffusion_rate: f64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct HoxExpression { pub hox_name: String, pub level: f64, pub constraint: Constraint }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Constraint { pub type_: String, pub value: f64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct HoxCoordinationParams { pub hox_genes: Vec<HoxGene>, pub body_length: f64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct HoxGene { pub name: String, pub position: f64, pub base_expression: f64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentContext {
    pub stage: DevelopmentalStage,
    pub body_plan: String,
    pub morphogens: Vec<MorphogenGradient>,
    pub signal_triggers: Vec<DevelopmentalSignal>,
    pub energy_budget: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentOutput {
    pub lineage: CellLineage,
    pub role_profile: Vec<GeneRoleProfile>,
    pub expression_signature: String,
    pub hox_coordination: Vec<HoxExpression>,
    pub competence_signals: Vec<String>,
    pub state: DevelopmentalState,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentProgram {
    pub stage: DevelopmentalStage,
    pub hox_genes: Vec<String>,
    pub morphogens: Vec<MorphogenGradient>,
    pub expressed_lineage: Option<String>,
    pub differentiation_factor: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GenomeCoord {
    pub genes: Vec<String>,
    pub roles: Vec<GeneRoleProfile>,
    pub hox_expressions: Vec<HoxExpression>,
    pub lineage: CellLineage,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MorphogenApplicationParams {
    pub genome: crate::genome::Genome,
    pub epigenome: Epigenome,
    pub morphogens: Vec<MorphogenDef>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_genome_different_epigenome() {
        let g = crate::genome::Genome::new("ATGC");
        let ea = Epigenome::new();
        let mut eb = Epigenome::new();
        eb.add_mark(crate::epigenome::MarkParams {
            locus: "NEURAL_DETERMINANT".to_string(),
            kind: EpigeneticMark::Methylation,
            level: 0.9,
        });
        let ctx = EmbryogenesisContext {
            signals: vec![],
            morphogens: vec![MorphogenGradient {
                name: "NEURAL".to_string(),
                concentration: 0.9,
                source_locus: "NODE".to_string(),
            }],
            energy_budget: 1.0,
            time_step: 10,
        };
        let ra = Embryogenesis::compute_program(&g, &ea, &ctx);
        let rb = Embryogenesis::compute_program(&g, &eb, &ctx);
        assert_ne!(ra.expressed_lineage, rb.expressed_lineage);
    }

    #[test]
    fn morphogen_determines_lineage() {
        let g = crate::genome::Genome::new("ATGC");
        let e = Epigenome::new();
        let ctx = EmbryogenesisContext {
            signals: vec![],
            morphogens: vec![MorphogenGradient {
                name: "SHH".to_string(),
                concentration: 0.9,
                source_locus: "NODE".to_string(),
            }],
            energy_budget: 1.0,
            time_step: 10,
        };
        let r = Embryogenesis::compute_program(&g, &e, &ctx);
        assert_eq!(r.expressed_lineage, Some("SHH".to_string()));
    }

    #[test]
    fn methylation_blocks_lineage() {
        let g = crate::genome::Genome::new("ATGC");
        let mut e = Epigenome::new();
        e.add_mark(crate::epigenome::MarkParams {
            locus: "NEURAL_DETERMINANT".to_string(),
            kind: EpigeneticMark::Methylation,
            level: 0.95,
        });
        let ctx = EmbryogenesisContext {
            signals: vec![],
            morphogens: vec![MorphogenGradient {
                name: "NEURAL".to_string(),
                concentration: 0.9,
                source_locus: "NODE".to_string(),
            }],
            energy_budget: 1.0,
            time_step: 10,
        };
        let r = Embryogenesis::compute_program(&g, &e, &ctx);
        assert!(!r.expressed_lineage.as_ref().unwrap().contains("NEURAL"));
    }

    #[test]
    fn stress_does_not_affect_lineage() {
        let g = crate::genome::Genome::new("ATGC");
        let mut e = Epigenome::new();
        e.add_mark(crate::epigenome::MarkParams {
            locus: "STRESS_RESPONSE".to_string(),
            kind: EpigeneticMark::Acetylation,
            level: 0.5,
        });
        let ctx = EmbryogenesisContext {
            signals: vec![],
            morphogens: vec![MorphogenGradient {
                name: "NEURAL".to_string(),
                concentration: 0.9,
                source_locus: "NODE".to_string(),
            }],
            energy_budget: 1.0,
            time_step: 10,
        };
        let r = Embryogenesis::compute_program(&g, &e, &ctx);
        assert!(r.expressed_lineage.as_ref().unwrap().contains("NEURAL"));
    }

    #[test]
    fn signals_integrated() {
        let g = crate::genome::Genome::new("ATGC");
        let e = Epigenome::new();
        let ctx = EmbryogenesisContext {
            signals: vec![
                DevelopmentalSignal::PathwayActivation { pathway: "WNT".to_string(), magnitude: 0.5 },
                DevelopmentalSignal::GeneKnockdown { target_locus: "GB".to_string(), reduction: 0.3 },
            ],
            morphogens: vec![],
            energy_budget: 1.0,
            time_step: 10,
        };
        let r = Embryogenesis::compute_program(&g, &e, &ctx);
        assert!(r.gene_expression_profile.contains_key("WNT"));
        assert!(*r.gene_expression_profile.get("GB").unwrap() < 1.0);
    }
}
