use std::collections::BTreeMap;

use genos_genome::{ChromatinState, ExpressionContext, Gene};

use crate::model::{AgentDna, Phenotype};

pub const DEFAULT_TEMP: f64 = 0.45;
pub const DEFAULT_TOP_P: f64 = 0.9;
pub const DEFAULT_STRATEGY: &str = "tree-search";
const GRN_ITERATIONS: usize = 8;

pub fn express(dna: &AgentDna) -> Phenotype {
    let effective = effective_genes(dna);
    let active_tfs = converge_tfs(dna, &effective);
    let active_mirnas = active_mirna_loci(&effective, &active_tfs);
    let mut phenotype = Phenotype {
        temp: DEFAULT_TEMP,
        top_p: DEFAULT_TOP_P,
        ..Phenotype::default()
    };
    let mut expressed = 0u32;
    for (locus, gene) in &effective {
        let context = ExpressionContext {
            active_tfs: &active_tfs,
            alternative_splicing: None,
            micro_rnas: &active_mirnas,
        };
        if gene.express(context).is_ok() {
            expressed += 1;
            classify(locus, gene, &mut phenotype);
        } else {
            phenotype.silenced.push(locus.clone());
        }
    }
    phenotype.expressed = expressed;
    phenotype.expr_tfs = active_tfs;
    phenotype.expr_mirnas = active_mirnas;
    finalize(&mut phenotype, dna);
    phenotype
}

fn effective_genes(dna: &AgentDna) -> BTreeMap<String, Gene> {
    let mut genes = dna.genes.clone();
    apply_marks(dna, &mut genes);
    apply_development_volume(dna, &mut genes);
    genes
}

fn apply_marks(dna: &AgentDna, genes: &mut BTreeMap<String, Gene>) {
    for (locus, mark) in &dna.epigenome.marks {
        let Some(gene) = genes.get_mut(locus) else { continue };
        apply_single_mark(gene, &mark.kind, mark.level);
    }
}

fn apply_single_mark(gene: &mut Gene, kind: &str, level: f64) {
    match kind {
        "Methylation" => {
            if level > 0.5 {
                gene.is_methylated = true;
            }
        }
        "Acetylation" => {
            gene.expression_volume = (gene.expression_volume + level * 0.5).min(1.0);
        }
        "Phosphorylation" => {
            gene.chromatin_state = demote_chromatin(&gene.chromatin_state);
        }
        _ => {}
    }
}

fn demote_chromatin(state: &ChromatinState) -> ChromatinState {
    match state {
        ChromatinState::HeterochromatinFacultative => ChromatinState::Euchromatin,
        ChromatinState::HeterochromatinConstitutive => ChromatinState::HeterochromatinFacultative,
        ChromatinState::Euchromatin => ChromatinState::Euchromatin,
    }
}

fn apply_development_volume(dna: &AgentDna, genes: &mut BTreeMap<String, Gene>) {
    if dna.development.stage == "Senescent" {
        for gene in genes.values_mut() {
            gene.expression_volume *= 0.7;
        }
    }
}

fn converge_tfs(dna: &AgentDna, genes: &BTreeMap<String, Gene>) -> Vec<String> {
    let basals = basal_levels(dna, genes);
    let mut levels = basals.clone();
    for _ in 0..GRN_ITERATIONS {
        levels = iterate_levels(dna, &basals, &levels);
    }
    active_tf_list(dna, genes, &levels)
}

fn basal_levels(dna: &AgentDna, genes: &BTreeMap<String, Gene>) -> BTreeMap<String, f64> {
    let mut out = BTreeMap::new();
    for (locus, gene) in genes {
        let basal = dna.grn.nodes.get(locus).map_or(gene.expression_volume.clamp(0.0, 1.0), |node| {
            node.basal_expression.clamp(0.0, 1.0)
        });
        out.insert(locus.clone(), basal + lineage_bias(dna, locus));
    }
    out
}

fn lineage_bias(dna: &AgentDna, locus: &str) -> f64 {
    match &dna.development.lineage_commitment {
        Some(lineage) if !lineage.trim().is_empty() => {
            if locus.contains(lineage.as_str()) {
                0.0
            } else {
                -0.2
            }
        }
        _ => 0.0,
    }
}

fn iterate_levels(
    dna: &AgentDna,
    basals: &BTreeMap<String, f64>,
    levels: &BTreeMap<String, f64>,
) -> BTreeMap<String, f64> {
    let mut next = BTreeMap::new();
    for locus in basals.keys() {
        let basal = basals.get(locus).cloned().unwrap_or(0.0);
        let input = edge_input(dna, levels, locus);
        let signal = node_signal(dna, locus);
        next.insert(locus.clone(), sigmoid(basal + input + signal));
    }
    next
}

fn edge_input(dna: &AgentDna, levels: &BTreeMap<String, f64>, target: &str) -> f64 {
    dna.grn
        .edges
        .iter()
        .filter(|edge| edge.to == target)
        .map(|edge| levels.get(&edge.from).cloned().unwrap_or(0.0) * edge.weight)
        .sum()
}

fn node_signal(dna: &AgentDna, locus: &str) -> f64 {
    morphogen_signal(dna, locus) + stage_signal(dna) + differentiation_signal(dna, locus)
}

fn morphogen_signal(dna: &AgentDna, locus: &str) -> f64 {
    if dna.development.morphogens.iter().any(|name| name == locus) {
        0.5
    } else {
        0.0
    }
}

fn stage_signal(dna: &AgentDna) -> f64 {
    match dna.development.stage.as_str() {
        "Mature" => 0.1,
        "Senescent" => -0.3,
        "Zygote" => -0.2,
        _ => 0.0,
    }
}

fn differentiation_signal(dna: &AgentDna, locus: &str) -> f64 {
    match &dna.development.differentiation_signal {
        Some(signal) if signal == locus => 0.3,
        _ => 0.0,
    }
}

fn sigmoid(value: f64) -> f64 {
    1.0 / (1.0 + (-value).exp())
}

fn active_tf_list(
    dna: &AgentDna,
    genes: &BTreeMap<String, Gene>,
    levels: &BTreeMap<String, f64>,
) -> Vec<String> {
    let mut out: Vec<String> = levels
        .iter()
        .filter(|(locus, level)| is_active_tf(dna, genes, locus, **level))
        .map(|(locus, _)| locus.clone())
        .collect();
    out.sort();
    out
}

fn is_active_tf(
    dna: &AgentDna,
    genes: &BTreeMap<String, Gene>,
    locus: &str,
    level: f64,
) -> bool {
    if level <= 0.5 {
        return false;
    }
    let Some(gene) = genes.get(locus) else { return false };
    if gene.is_methylated {
        return false;
    }
    if gene.chromatin_state == ChromatinState::HeterochromatinConstitutive {
        return false;
    }
    dna.grn.nodes.get(locus).map_or(is_tf_locus(locus), |node| node.is_tf)
}

fn is_tf_locus(locus: &str) -> bool {
    locus.starts_with("TF_") || locus.starts_with("PIONEER_")
}

fn active_mirna_loci(genes: &BTreeMap<String, Gene>, active_tfs: &[String]) -> Vec<String> {
    let empty: Vec<String> = Vec::new();
    let mut out = Vec::new();
    for (locus, gene) in genes {
        if !locus.starts_with("MIR_") {
            continue;
        }
        let context = ExpressionContext {
            active_tfs,
            alternative_splicing: None,
            micro_rnas: &empty,
        };
        if gene.express(context).is_ok() {
            out.push(locus.clone());
        }
    }
    out.sort();
    out
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
    phenotype.tools.sort();
    phenotype.capabilities.sort();
    phenotype.silenced.sort();
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
