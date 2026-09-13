//! ADN détaillé : codec, validation, expression et opérations génétiques.

use genos_dna::model::AgentDna;
use genos_dna::operations::{CloneOptions, CrossOptions, DecoyOptions, MutateOptions};
use genos_genome::Genome;

pub use genos_dna::operations::{clone_dna, cross, decoy, mutate};
pub use genos_dna::{Meta, Phenotype, Provenance};

/// Construit un ADN agent à partir d'un génome.
pub fn from_genome(genome: &Genome, name: &str) -> AgentDna {
    AgentDna::from_genome(genome, name, Provenance::default())
}

pub fn encode(dna: &AgentDna) -> Result<Vec<u8>, String> {
    genos_dna::codec::encode(dna)
}

pub fn decode(bytes: &[u8]) -> Result<AgentDna, String> {
    genos_dna::codec::decode(bytes)
}

pub fn content_hash(dna: &AgentDna) -> Result<String, String> {
    genos_dna::codec::content_hash(dna)
}

pub fn validate(dna: &AgentDna) -> Result<(), String> {
    genos_dna::validate::validate(dna)
}

pub fn express(dna: &AgentDna) -> Phenotype {
    genos_dna::express::express(dna)
}

pub fn to_genome(dna: &AgentDna) -> Result<Genome, String> {
    dna.to_genome()
}

/// Croisement de deux ADN agents.
pub fn cross_dna(a: &AgentDna, b: &AgentDna, options: &CrossOptions) -> Result<AgentDna, String> {
    cross(a, b, options)
}

/// Mutation (stochastique ou ciblée) d'un ADN agent.
pub fn mutate_dna(dna: &AgentDna, options: &MutateOptions) -> Result<AgentDna, String> {
    mutate(dna, options)
}

/// Clonage d'un ADN agent (mitose / bourgeonnement / méiose selon les options).
pub fn clone_agent_dna(dna: &AgentDna, options: &CloneOptions) -> Result<AgentDna, String> {
    clone_dna(dna, options)
}

/// Insertion d'un leurre (decoy) dans l'ADN.
pub fn decoy_dna(dna: &AgentDna, options: &DecoyOptions) -> Result<AgentDna, String> {
    decoy(dna, options)
}

/// Compile un manifeste en ADN agent.
pub fn compile_manifest(manifest: &genos_dna::manifest::Manifest) -> Result<AgentDna, String> {
    genos_dna::compile::compile_manifest(manifest)
}
