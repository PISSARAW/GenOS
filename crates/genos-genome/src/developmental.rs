use serde::{Deserialize, Serialize};

use crate::epigenome::{DevelopmentalStage, Epigenome};

// ── Cell lineages ───────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum CellLineage {
    Neural,
    Mesoderm,
    Endoderm,
    Ectoderm,
    Germline,
}

// ── Developmental state ─────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentalState {
    pub lineage: Option<CellLineage>,
    pub stage: DevelopmentalStage,
    pub differentiation_index: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum GeneRoleExpr {
    Constitutive,
    DevelopmentallyActivated {},
}

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

// ── Morphogens & HOX ────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Morphogen {
    pub name: String,
    pub concentration: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MorphogenDef {
    pub name: String,
    pub source: String,
    pub sink: String,
    pub diffusion_rate: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct HoxExpression {
    pub hox_name: String,
    pub level: f64,
    pub constraint: Constraint,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Constraint {
    pub type_: String,
    pub value: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct HoxCoordinationParams {
    pub hox_genes: Vec<HoxGene>,
    pub body_length: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct HoxGene {
    pub name: String,
    pub position: f64,
    pub base_expression: f64,
}

// ── Development context & output ────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentContext {
    pub stage: DevelopmentalStage,
    pub body_plan: String,
    pub morphogens: Vec<super::development::MorphogenGradient>,
    pub signal_triggers: Vec<super::development::DevelopmentalSignal>,
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
    pub morphogens: Vec<super::development::MorphogenGradient>,
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
