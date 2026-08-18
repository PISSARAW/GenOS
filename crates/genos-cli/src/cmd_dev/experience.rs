use super::helpers::*;
use crate::args::*;
use anyhow::{anyhow, Result};
use genos_core::*;
use serde_json::json;

pub fn cmd_record_experience(args: RecordExperienceArgs) -> Result<()> {
    let mut artifact =
        ExperienceArtifact::new(args.strategy, args.context, args.outcome, args.successful);
    artifact.evidence = args.evidence;
    artifact.source_branch = args.source_branch;
    let path = ledger(&args.root, "experiences");
    let mut artifacts: Vec<ExperienceArtifact> = read_vec(&path)?;
    artifacts.push(artifact.clone());
    save_vec(&path, &artifacts)?;
    output(&artifact)
}

pub fn cmd_search_failures(args: SearchFailuresArgs) -> Result<()> {
    let query = args.query.to_lowercase();
    let artifacts: Vec<ExperienceArtifact> = read_vec(&ledger(&args.root, "experiences"))?;
    let failures: Vec<_> = artifacts
        .into_iter()
        .filter(|e| {
            !e.successful
                && [e.strategy.as_str(), e.context.as_str(), e.outcome.as_str()]
                    .iter()
                    .any(|v| v.to_lowercase().contains(&query))
        })
        .collect();
    output(json!({"query": args.query, "failures": failures}))
}

pub fn cmd_cherry_pick_experience(args: CherryPickExperienceArgs) -> Result<()> {
    let path = ledger(&args.root, "experiences");
    let mut artifacts: Vec<ExperienceArtifact> = read_vec(&path)?;
    let artifact = artifacts
        .iter_mut()
        .find(|e| e.id == args.experience_id)
        .ok_or_else(|| anyhow!("unknown experience id '{}'", args.experience_id))?;
    if !artifact.imported_into.contains(&args.to_branch) {
        artifact.imported_into.push(args.to_branch);
    }
    let result = artifact.clone();
    save_vec(&path, &artifacts)?;
    output(&result)
}
