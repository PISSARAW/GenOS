use crate::args::{PlatformIngestArgs, PlatformSearchArgs};
use anyhow::{Context, Result};
use genos_platform::HybridIndex;
use std::fs;

pub fn cmd_platform_ingest(args: PlatformIngestArgs) -> Result<()> {
    let mut index = load_index(&args.index)?;
    let count = index.ingest_path(&args.document, args.chunk_size, args.overlap)?;
    if let Some(parent) = args.index.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&args.index, serde_json::to_vec_pretty(&index)?)?;
    println!(
        "indexed {} chunks from {} into {}",
        count,
        args.document.display(),
        args.index.display()
    );
    Ok(())
}

pub fn cmd_platform_search(args: PlatformSearchArgs) -> Result<()> {
    let index = load_index(&args.index)?;
    let hits = index.search(&args.query, args.limit);
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({ "query": args.query, "hits": hits }))?
    );
    Ok(())
}

pub fn cmd_platform_status() -> Result<()> {
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "rag": ["document_ingestion", "chunking", "hybrid_search", "rrf_reranking", "claim_citations"],
            "evaluation": ["versioned_datasets", "exact_match", "grounding", "abstention"],
            "prompts": ["versioned_registry", "labels", "digest", "template_rendering"],
            "observability": ["w3c_trace_context", "otlp_http"]
        }))?
    );
    Ok(())
}

fn load_index(path: &std::path::Path) -> Result<HybridIndex> {
    if !path.exists() {
        return Ok(HybridIndex::default());
    }
    serde_json::from_slice(&fs::read(path).with_context(|| format!("reading {}", path.display()))?)
        .with_context(|| format!("parsing {}", path.display()))
}
