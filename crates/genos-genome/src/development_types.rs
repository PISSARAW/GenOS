use serde::{Deserialize, Serialize};

use crate::epigenome::{DevelopmentalStage, Epigenome};

// ── Cell lineages ───────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum CellLineage {
    Neural,
    Mesoderm,
    Endoderm,
    Ectoderm,
    Germline,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentalState {
    pub stage: DevelopmentalStage,
    pub lineage: Option<CellLineage>,
    pub morphogen_profile: HashMap<String, f64>,
    pub gene_expression_profile: HashMap<String, f64>,
    pub epigenetic_landscape: HashMap<String, f64>,
}

impl Default for DevelopmentalState {
    fn default() -> Self {
        Self {
            stage: DevelopmentalStage::Zygote,
            lineage: None,
            morphogen_profile: HashMap::new(),
            gene_expression_profile: HashMap::new(),
            epigenetic_landscape: HashMap::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum GeneRoleExpr {
    Constitutive,
    DevelopmentallyActivated {},
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GeneRoleProfile {
    pub locus: String,
    pub role: GeneRoleExpr,
    pub activation_threshold: f64,
}

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

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentContext {
    pub active_tfs: Vec<String>,
    pub alternative_splicing: Option<Vec<(usize, usize)>>,
    pub micro_rnas: Vec<String>,
    pub energy_budget: f64,
    pub morphogen_defs: Vec<MorphogenDef>,
    pub constraints: Vec<Constraint>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentOutput {
    pub final_stage: DevelopmentalStage,
    pub differentiated: bool,
    pub lineage: Option<CellLineage>,
    pub morphogen_profiles: HashMap<String, f64>,
    pub gene_expression: HashMap<String, f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct DevelopmentProgram {
    pub gene_expression_profile: HashMap<String, f64>,
    pub epigenetic_landscape: HashMap<String, f64>,
    pub expressed_lineage: Option<String>,
    pub stages_reached: Vec<DevelopmentalStage>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GenomeCoord {
    pub chromosome: String,
    pub position: usize,
    pub strand: char,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MorphogenApplicationParams {
    pub morphogen_name: String,
    pub target_locus: String,
    pub concentration: f64,
}

use std::collections::HashMap;