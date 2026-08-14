use crate::args::{TemporalExperimentArgs, WorkspaceExperimentArgs};
use crate::output::print_serialized;
use anyhow::Context;
use genos_runtime::{
    persist_experiment_report, run_temporal_experiment, run_workspace_experiment,
    TemporalExperimentManifest, WorkspaceExperimentManifest,
};
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;

#[derive(Serialize)]
struct ExperimentRunOutput<T> {
    report_path: String,
    report: T,
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
