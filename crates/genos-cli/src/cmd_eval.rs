use crate::args::{EvalImportArgs, EvalRunArgs};
use anyhow::{Context, Result};
use genos_platform::{evaluate_response, EvalCase, EvalDataset};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs};

#[derive(Debug, Deserialize)]
struct ImportedDataset {
    name: String,
    #[serde(default = "default_version")]
    version: u32,
    cases: Vec<EvalCase>,
}
fn default_version() -> u32 {
    1
}
#[derive(Debug, Serialize)]
struct BatchReport {
    dataset: String,
    version: u32,
    scores: Vec<genos_platform::EvalScore>,
    exact_match: f32,
    grounded: f32,
}

pub fn cmd_eval_import(args: EvalImportArgs) -> Result<()> {
    let input: ImportedDataset = serde_json::from_slice(&fs::read(&args.input)?)?;
    let dataset = EvalDataset::new(input.name, input.version, input.cases);
    if let Some(parent) = args.output.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&args.output, serde_json::to_vec_pretty(&dataset)?)?;
    println!(
        "imported {} cases into {}",
        dataset.cases.len(),
        args.output.display()
    );
    Ok(())
}
pub fn cmd_eval_run(args: EvalRunArgs) -> Result<()> {
    let dataset = EvalDataset::load_json(&args.dataset)
        .with_context(|| format!("loading dataset {}", args.dataset.display()))?;
    let responses: BTreeMap<String, String> = serde_json::from_slice(&fs::read(&args.responses)?)?;
    let scores: Vec<_> = dataset
        .cases
        .iter()
        .map(|case| {
            evaluate_response(
                case,
                responses.get(&case.id).map(String::as_str).unwrap_or(""),
                &[],
            )
        })
        .collect();
    let count = scores.len().max(1) as f32;
    let report = BatchReport {
        dataset: dataset.name,
        version: dataset.version,
        exact_match: scores.iter().map(|s| s.exact_match).sum::<f32>() / count,
        grounded: scores.iter().map(|s| s.grounded).sum::<f32>() / count,
        scores,
    };
    let encoded = serde_json::to_vec_pretty(&report)?;
    if let Some(output) = args.output {
        fs::write(output, encoded)?;
    } else {
        println!("{}", String::from_utf8(encoded)?);
    }
    Ok(())
}
