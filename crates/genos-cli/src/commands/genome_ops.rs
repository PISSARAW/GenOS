use genos_dna::operations::{self, CloneOptions, CrossOptions, DecoyOptions, MutateOptions};
use genos_dna::{codec, validate, AgentDna};
use serde_json::json;

use crate::commands::output_guard::{resolve_output_path, WriteOptions};

pub struct PersistSpec<'a> {
    pub op: &'a str,
    pub output: &'a str,
    pub write: WriteOptions,
}

pub struct CrossRequest<'a> {
    pub parent_a: &'a str,
    pub parent_b: &'a str,
    pub output: &'a str,
    pub swap_prob: f64,
    pub point: Option<usize>,
    pub seed: Option<String>,
    pub speciation_threshold: Option<f64>,
    pub write: WriteOptions,
}

pub struct MutateRequest<'a> {
    pub input: &'a str,
    pub output: &'a str,
    pub rate: f64,
    pub hyper: bool,
    pub locus: Option<String>,
    pub seed: Option<String>,
    pub write: WriteOptions,
}

pub struct CloneRequest<'a> {
    pub input: &'a str,
    pub output: &'a str,
    pub mode: String,
    pub daughter_volume: f64,
    pub mutation_rate: f64,
    pub seed: Option<String>,
    pub write: WriteOptions,
}

pub struct DecoyRequest<'a> {
    pub input: &'a str,
    pub output: &'a str,
    pub selector: String,
    pub detectability: f64,
    pub write: WriteOptions,
}

pub fn handle_cross(req: CrossRequest) -> Result<(), String> {
    let parent_a = read_dna(req.parent_a)?;
    let parent_b = read_dna(req.parent_b)?;
    let options = CrossOptions {
        swap_prob: req.swap_prob,
        point: req.point,
        seed: req.seed,
        speciation_threshold: req.speciation_threshold,
    };
    let child = operations::cross(&parent_a, &parent_b, &options)?;
    persist(&PersistSpec { op: "genome_cross", output: req.output, write: req.write }, &child)
}

pub fn handle_mutate(req: MutateRequest) -> Result<(), String> {
    let dna = read_dna(req.input)?;
    let options = MutateOptions { rate: req.rate, hyper: req.hyper, locus: req.locus, seed: req.seed };
    let mutated = operations::mutate(&dna, &options)?;
    persist(&PersistSpec { op: "genome_mutate", output: req.output, write: req.write }, &mutated)
}

pub fn handle_clone(req: CloneRequest) -> Result<(), String> {
    let dna = read_dna(req.input)?;
    let options = CloneOptions {
        mode: req.mode.clone(),
        daughter_volume: req.daughter_volume,
        mutation_rate: req.mutation_rate,
        seed: req.seed,
    };
    let child = operations::clone_dna(&dna, &options)?;
    persist(&PersistSpec { op: "genome_clone", output: req.output, write: req.write }, &child)
}

pub fn handle_decoy(req: DecoyRequest) -> Result<(), String> {
    let dna = read_dna(req.input)?;
    let options = DecoyOptions {
        target_selector: req.selector,
        detectability: req.detectability,
        marker: Vec::new(),
    };
    let decoy = operations::decoy(&dna, &options)?;
    persist(&PersistSpec { op: "genome_decoy", output: req.output, write: req.write }, &decoy)
}

fn read_dna(path: &str) -> Result<AgentDna, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("Failed to read genome '{}': {}", path, error))?;
    validate::validate_bytes(&bytes)
}

fn persist(spec: &PersistSpec, dna: &AgentDna) -> Result<(), String> {
    let content_hash = codec::content_hash(dna)?;
    let bytes = codec::encode(dna)?;
    let path = resolve_output_path(spec.output, &spec.write)?;
    std::fs::write(&path, &bytes).map_err(|error| format!("Failed to write '{}': {}", path.display(), error))?;
    let parents: Vec<String> = dna.provenance.parents.iter().map(|id| id.to_string()).collect();
    println!("{}", json!({
        "success": true,
        "operation": spec.op,
        "format": "AgentDNA/v1",
        "output": path.display().to_string(),
        "bytes": bytes.len(),
        "content_hash": content_hash,
        "genome_ref": &content_hash[0..32],
        "name": dna.meta.name,
        "generation": dna.meta.generation,
        "genes": dna.genes.len(),
        "parents": parents,
        "mutations": dna.provenance.mutations.len(),
        "is_decoy": dna.provenance.decoy.is_some(),
    }));
    Ok(())
}
