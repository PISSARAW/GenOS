use genos_genome::{Gene, Genome};

use crate::express::{self, DEFAULT_TOP_P, DEFAULT_TEMP};
use crate::manifest::Manifest;
use crate::model::{AgentDna, Provenance};

pub const MAX_LOCUS: usize = 64;
pub const DEFAULT_STRATEGY: &str = "tree-search";

pub fn compile_manifest(manifest: &Manifest) -> Result<AgentDna, String> {
    let name = manifest.display_name().trim().to_string();
    if name.is_empty() {
        return Err("manifest metadata.name must not be empty".to_string());
    }
    let role = normalize_role(&manifest.identity.role);
    let mut genome = Genome::new(&format!("{name}:{role}"));
    insert_role_genes(&mut genome, &role, manifest);
    insert_capability_genes(&mut genome, &manifest.capabilities)?;
    insert_tool_genes(&mut genome, manifest.allowed_tools())?;
    let mut dna = AgentDna::from_genome(&genome, &name, build_provenance(manifest));
    dna.phenotype = Some(express::express(&dna));
    Ok(dna)
}

fn normalize_role(role: &str) -> String {
    let trimmed = role.trim();
    if trimmed.is_empty() {
        return "worker".to_string();
    }
    trimmed.to_string()
}

fn strategy_for(role: &str) -> &'static str {
    let normalized = role.to_ascii_lowercase();
    if normalized.contains("security") || normalized.contains("threat") || normalized.contains("adversar") {
        return "adversarial-falsification";
    }
    if normalized.contains("author") || normalized.contains("creative") || normalized.contains("literary") {
        return "dialectic-exploration";
    }
    if normalized.contains("data") || normalized.contains("database") || normalized.contains("storage") {
        return "invariant-verification";
    }
    DEFAULT_STRATEGY
}

fn insert_role_genes(genome: &mut Genome, role: &str, manifest: &Manifest) {
    genome.insert_gene(Gene::new("ROLE", role));
    genome.insert_gene(Gene::new("STRATEGY", strategy_for(role)));
    genome.insert_gene(Gene::new("MODEL_TEMP", &DEFAULT_TEMP.to_string()));
    genome.insert_gene(Gene::new("MODEL_TOPP", &DEFAULT_TOP_P.to_string()));
    let mission = manifest
        .objectives
        .primary
        .clone()
        .unwrap_or_else(|| role.to_string());
    genome.insert_gene(Gene::new("OBJECTIVE_PRIMARY", &mission));
}

fn insert_capability_genes(genome: &mut Genome, capabilities: &[String]) -> Result<(), String> {
    for capability in capabilities {
        let locus = locus("CAP", capability)?;
        genome.insert_gene(Gene::new(&locus, capability));
    }
    Ok(())
}

fn insert_tool_genes(genome: &mut Genome, tools: &[String]) -> Result<(), String> {
    for tool in tools {
        let locus = locus("TOOL", tool)?;
        genome.insert_gene(Gene::new(&locus, tool));
    }
    Ok(())
}

fn locus(prefix: &str, raw: &str) -> Result<String, String> {
    let mut out = String::with_capacity(prefix.len() + 1 + raw.len());
    out.push_str(prefix);
    out.push('_');
    for character in raw.chars() {
        if character.is_ascii_alphanumeric() {
            out.push(character.to_ascii_uppercase());
        } else if is_locus_separator(character) {
            out.push('_');
        }
    }
    while out.ends_with('_') {
        out.pop();
    }
    if out.len() > MAX_LOCUS {
        out.truncate(MAX_LOCUS);
    }
    if out.len() <= prefix.len() + 1 {
        return Err(format!("cannot derive a locus from '{raw}'"));
    }
    Ok(out)
}

fn is_locus_separator(character: char) -> bool {
    matches!(character, ' ' | '_' | '-' | '.' | '/' | ':' | '\'')
}

fn build_provenance(manifest: &Manifest) -> Provenance {
    Provenance {
        source_manifest: Some(manifest.display_name().to_string()),
        source_doc: manifest.objectives.source_doc.clone(),
        ..Provenance::default()
    }
}
