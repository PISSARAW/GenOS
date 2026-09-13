use genos_genome::{ExpressionContext, Gene};

use crate::model::{AgentDna, Phenotype};

pub const DEFAULT_TEMP: f64 = 0.45;
pub const DEFAULT_TOP_P: f64 = 0.9;
pub const DEFAULT_STRATEGY: &str = "tree-search";

pub fn express(dna: &AgentDna) -> Phenotype {
    let empty_tfs: Vec<String> = Vec::new();
    let empty_mirnas: Vec<String> = Vec::new();
    let mut phenotype = Phenotype {
        temp: DEFAULT_TEMP,
        top_p: DEFAULT_TOP_P,
        expr_tfs: vec!["PIONEER_FACTOR".to_string()],
        ..Phenotype::default()
    };
    let mut expressed = 0u32;
    for (locus, gene) in &dna.genes {
        let context = ExpressionContext {
            active_tfs: &empty_tfs,
            alternative_splicing: None,
            micro_rnas: &empty_mirnas,
        };
        if gene.express(context).is_ok() {
            expressed += 1;
            classify(locus, gene, &mut phenotype);
        } else {
            phenotype.silenced.push(locus.clone());
        }
    }
    phenotype.expressed = expressed;
    finalize(&mut phenotype, dna);
    phenotype
}

fn classify(locus: &str, gene: &Gene, phenotype: &mut Phenotype) {
    let value = gene.dna.decode_instruction();
    if locus == "ROLE" {
        phenotype.role = value;
    } else if locus == "STRATEGY" {
        phenotype.strategy = value;
    } else if locus == "OBJECTIVE_PRIMARY" {
        phenotype.prompt = value;
    } else if locus == "MODEL_TEMP" {
        phenotype.temp = parse_unit(&value, DEFAULT_TEMP);
    } else if locus == "MODEL_TOPP" {
        phenotype.top_p = parse_unit(&value, DEFAULT_TOP_P);
    } else if locus.starts_with("TOOL_") {
        phenotype.tools.push(value);
    } else if locus.starts_with("CAP_") {
        phenotype.capabilities.push(value);
    }
}

fn finalize(phenotype: &mut Phenotype, dna: &AgentDna) {
    if phenotype.role.trim().is_empty() {
        phenotype.role = dna.meta.name.clone();
    }
    if phenotype.strategy.trim().is_empty() {
        phenotype.strategy = DEFAULT_STRATEGY.to_string();
    }
    if phenotype.prompt.trim().is_empty() {
        phenotype.prompt = format!("{}: {}", phenotype.role, dna.meta.name);
    }
    phenotype.temp = clamp_unit(phenotype.temp, DEFAULT_TEMP);
    phenotype.top_p = clamp_unit(phenotype.top_p, DEFAULT_TOP_P);
}

fn parse_unit(value: &str, fallback: f64) -> f64 {
    value
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|number| number.is_finite())
        .map_or(fallback, |number| number.clamp(0.0, 1.0))
}

fn clamp_unit(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        fallback
    }
}
