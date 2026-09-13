use genos_dna::manifest::Manifest;
use genos_dna::{codec, compile, validate};
use serde_json::json;

use crate::args::GenomeSubcommands;
use crate::commands::output_guard::{resolve_output_path, WriteOptions};

pub fn execute(cmd: GenomeSubcommands) -> Result<(), String> {
    match cmd {
        GenomeSubcommands::Compile { input, output, force, parents } => {
            let opts = WriteOptions { force, parents };
            handle_compile(&input, &output, &opts)
        }
        GenomeSubcommands::Validate { file } => handle_validate(&file),
        GenomeSubcommands::Inspect { file } => handle_inspect(&file),
    }
}

fn handle_compile(input: &str, output: &str, opts: &WriteOptions) -> Result<(), String> {
    let text = std::fs::read_to_string(input)
        .map_err(|error| format!("Failed to read manifest '{}': {}", input, error))?;
    let manifest: Manifest = serde_json::from_str(&text)
        .map_err(|error| format!("Invalid AgentGenome manifest '{}': {}", input, error))?;
    let mut dna = compile::compile_manifest(&manifest)?;
    dna.provenance.source_manifest = Some(input.to_string());
    let content_hash = codec::content_hash(&dna)?;
    let bytes = codec::encode(&dna)?;
    let path = resolve_output_path(output, opts)?;
    std::fs::write(&path, &bytes)
        .map_err(|error| format!("Failed to write '{}': {}", path.display(), error))?;
    let phenotype = dna.phenotype;
    let tools = phenotype.as_ref().map(|value| value.tools.clone()).unwrap_or_default();
    let capabilities = phenotype
        .as_ref()
        .map(|value| value.capabilities.clone())
        .unwrap_or_default();
    println!("{}", json!({
        "success": true,
        "operation": "genome_compile",
        "format": "AgentDNA/v1",
        "input": input,
        "output": path.display().to_string(),
        "bytes": bytes.len(),
        "content_hash": content_hash,
        "genome_ref": &content_hash[0..32],
        "genes": dna.genes.len(),
        "tools": tools,
        "capabilities": capabilities,
    }));
    Ok(())
}

fn handle_validate(file: &str) -> Result<(), String> {
    let bytes = std::fs::read(file)
        .map_err(|error| format!("Failed to read genome '{}': {}", file, error))?;
    match validate::validate_bytes(&bytes) {
        Ok(dna) => {
            let content_hash = codec::content_hash(&dna).unwrap_or_default();
            println!("{}", json!({
                "success": true,
                "operation": "genome_validate",
                "format": "AgentDNA/v1",
                "file": file,
                "status": "VALID",
                "content_hash": content_hash,
                "genome": {
                    "name": dna.meta.name,
                    "generation": dna.meta.generation,
                    "genes": dna.genes.len(),
                },
            }));
            Ok(())
        }
        Err(reason) => {
            println!("{}", json!({
                "success": false,
                "operation": "genome_validate",
                "format": "AgentDNA/v1",
                "file": file,
                "status": "INVALID",
                "errors": [reason.clone()],
            }));
            Err(format!("AgentDNA validation failed: {reason}"))
        }
    }
}

fn handle_inspect(file: &str) -> Result<(), String> {
    let bytes = std::fs::read(file)
        .map_err(|error| format!("Failed to read genome '{}': {}", file, error))?;
    let dna = codec::decode(&bytes)?;
    let content_hash = codec::content_hash(&dna)?;
    let phenotype = dna.phenotype.clone();
    println!("{}", json!({
        "success": true,
        "operation": "genome_inspect",
        "format": "AgentDNA/v1",
        "file": file,
        "content_hash": content_hash,
        "name": dna.meta.name,
        "generation": dna.meta.generation,
        "ploidy": dna.meta.ploidy,
        "hayflick_limit": dna.meta.hayflick_limit,
        "chromosome_bases": { "maternal": dna.maternal.len(), "paternal": dna.paternal.len() },
        "genes": dna.genes.len(),
        "plasmids": dna.plasmids.len(),
        "enhancers": dna.enhancers.len(),
        "provenance": {
            "source_manifest": dna.provenance.source_manifest,
            "source_doc": dna.provenance.source_doc,
        },
        "phenotype": phenotype.map(|value| json!({
            "role": value.role,
            "strategy": value.strategy,
            "tools": value.tools,
            "capabilities": value.capabilities,
            "temp": value.temp,
            "topP": value.top_p,
            "expressed": value.expressed,
            "silenced": value.silenced,
        })),
    }));
    Ok(())
}
