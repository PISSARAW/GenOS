use genos_genome::{Gene, Genome};

use crate::express::{self, DEFAULT_TOP_P, DEFAULT_TEMP};
use crate::manifest::{Manifest, ModelPolicy};
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
    insert_policy_genes(&mut genome, manifest)?;
    let mut dna = AgentDna::from_genome(&genome, &name, build_provenance(manifest));
    preserve_manifest_labels(&mut dna, manifest);
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

fn insert_policy_genes(genome: &mut Genome, manifest: &Manifest) -> Result<(), String> {
    insert_json_gene(genome, "COGNITION", &manifest.cognition)?;
    insert_json_gene(genome, "MEMORY_POLICY", &manifest.memory_policy)?;
    insert_json_gene(genome, "MEMORY", &manifest.memory)?;
    insert_json_gene(genome, "POLICIES", &manifest.policies)?;
    insert_json_gene(genome, "MODEL_POLICY", &manifest.model_policy)?;
    Ok(())
}

fn insert_json_gene(genome: &mut Genome, locus: &str, value: &dyn JsonValue) -> Result<(), String> {
    let Some(text) = value.as_json_text() else { return Ok(()) };
    if text.trim().is_empty() || text == "null" {
        return Ok(());
    }
    genome.insert_gene(Gene::new(locus, &truncate_instruction(&text)));
    Ok(())
}

trait JsonValue {
    fn as_json_text(&self) -> Option<String>;
}

impl JsonValue for Option<serde_json::Value> {
    fn as_json_text(&self) -> Option<String> {
        self.as_ref().map(|value| value.to_string())
    }
}

impl JsonValue for Option<ModelPolicy> {
    fn as_json_text(&self) -> Option<String> {
        self.as_ref().and_then(|policy| serde_json::to_string(policy).ok())
    }
}

fn truncate_instruction(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.len() > 512 {
        trimmed[..512].to_string()
    } else {
        trimmed.to_string()
    }
}

fn preserve_manifest_labels(dna: &mut AgentDna, manifest: &Manifest) {
    insert_label(dna, "manifest.kind", manifest.kind.as_deref());
    insert_label(dna, "manifest.apiVersion", manifest.api_version.as_deref());
    if let Some(name) = &manifest.identity.name {
        insert_label(dna, "identity.name", Some(name));
    }
    if let Some(meaning) = &manifest.identity.name_meaning {
        insert_label(dna, "identity.name_meaning", Some(meaning));
    }
}

fn insert_label(dna: &mut AgentDna, key: &str, value: Option<&str>) {
    if let Some(text) = value {
        if !text.trim().is_empty() {
            dna.meta.labels.insert(key.to_string(), text.to_string());
        }
    }
}
