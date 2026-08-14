use crate::args::{IncidentExperimentArgs, TemporalExperimentArgs, WorkspaceExperimentArgs};
use crate::output::print_serialized;
use anyhow::Context;
use genos_runtime::{
    persist_experiment_report, run_temporal_experiment, run_workspace_experiment,
    TemporalExperimentManifest, WorkspaceExperimentManifest,
    IncidentSearchManifest, run_incident_search,
};
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;

#[derive(Serialize)]
struct ExperimentRunOutput<T> {
    report_path: String,
    report: T,
}

#[derive(Serialize)]
struct IncidentSummaryOutput {
    report_path: String,
    snapshot_ref: String,
    initial_universes: usize,
    partial_reproductions: usize,
    recursive_descendants: usize,
    perfect_reproductions: usize,
    perfect_branch_ids: Vec<String>,
}

fn read_manifest<T: DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("reading experiment manifest {}", path.display()))?;
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("yaml" | "yml") => Ok(serde_yaml::from_slice(&bytes)?),
        _ => Ok(serde_json::from_slice(&bytes)?),
    }
}

pub async fn cmd_experiment_workspace(args: WorkspaceExperimentArgs) -> anyhow::Result<()> {
    let mut manifest: WorkspaceExperimentManifest = read_manifest(&args.manifest)?;
    if manifest.seed_dir.is_relative() {
        let base = args.manifest.parent().unwrap_or_else(|| Path::new("."));
        manifest.seed_dir = base.join(&manifest.seed_dir);
    }
    let name = manifest.name.clone();
    let experiment_root = args.root.join(&name);
    let report = run_workspace_experiment(manifest, &experiment_root).await?;
    let report_path = persist_experiment_report(&experiment_root, &name, &report)?;
    print_serialized(
        &ExperimentRunOutput { report_path: report_path.display().to_string(), report },
        args.format,
    )
}

pub fn cmd_experiment_temporal(args: TemporalExperimentArgs) -> anyhow::Result<()> {
    let manifest: TemporalExperimentManifest = read_manifest(&args.manifest)?;
    let name = manifest.name.clone();
    let experiment_root = args.root.join(&name);
    let report = run_temporal_experiment(manifest);
    let report_path = persist_experiment_report(&experiment_root, &name, &report)?;
    print_serialized(
        &ExperimentRunOutput { report_path: report_path.display().to_string(), report },
        args.format,
    )
}

pub fn cmd_experiment_incident(args: IncidentExperimentArgs) -> anyhow::Result<()> {
    let manifest: IncidentSearchManifest = read_manifest(&args.manifest)?;
    let name = manifest.name.clone();
    let experiment_root = args.root.join(&name);
    let report = run_incident_search(manifest)?;
    let report_path = persist_experiment_report(&experiment_root, &name, &report)?;
    if args.summary {
        print_serialized(
            &IncidentSummaryOutput {
                report_path: report_path.display().to_string(),
                snapshot_ref: report.snapshot_ref,
                initial_universes: report.initial_universes.len(),
                partial_reproductions: report.partial_survivor_ids.len(),
                recursive_descendants: report.descendants.len(),
                perfect_reproductions: report.perfect_reproduction_ids.len(),
                perfect_branch_ids: report.perfect_reproduction_ids.into_iter().map(|id| id.0).collect(),
            },
            args.format,
        )
    } else {
        print_serialized(
            &ExperimentRunOutput { report_path: report_path.display().to_string(), report },
            args.format,
        )
    }
}
