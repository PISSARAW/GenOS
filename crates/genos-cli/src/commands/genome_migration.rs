use genos_dna::{codec, migration, validate};
use serde_json::json;
use crate::commands::output_guard::{resolve_output_path, WriteOptions};

pub fn execute(input: &str, output: &str, options: &WriteOptions) -> Result<(), String> {
    let bytes = std::fs::read(input).map_err(|error| format!("Cannot read genome: {error}"))?;
    let source = validate::validate_bytes(&bytes)?;
    let source_hash = codec::content_hash(&source)?;
    let migrated = migration::requires_hachimoji(&source);
    let (target, encoded) = prepare(source, bytes)?;
    let path = resolve_output_path(output, options)?;
    std::fs::write(&path, encoded).map_err(|error| format!("Cannot write genome: {error}"))?;
    let content_hash = codec::content_hash(&target)?;
    println!("{}", json!({
        "success": true, "operation": "genome_migrate_hachimoji", "migrated": migrated,
        "format": "AgentDNA/v2", "alphabet": "ACGTPZBS", "source_content_hash": source_hash,
        "content_hash": content_hash, "genome_id": target.meta.genome_id,
        "lineage_id": target.meta.lineage_id, "phenotype_preserved": true,
        "promotion_authorized": false, "status": target.meta.status.as_str(),
        "output": path.display().to_string()
    }));
    Ok(())
}

fn prepare(source: genos_dna::AgentDna, bytes: Vec<u8>) -> Result<(genos_dna::AgentDna, Vec<u8>), String> {
    if migration::requires_hachimoji(&source) {
        let target = migration::to_hachimoji(&source)?;
        let encoded = codec::encode(&target)?;
        validate::validate_bytes(&encoded)?;
        Ok((target, encoded))
    } else {
        Ok((source, bytes))
    }
}
