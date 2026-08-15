use crate::args::{
    BugInvestigationArgs, GenericExperimentArgs, IncidentExperimentArgs, ScientificExperimentArgs,
    SecurityCoevolutionArgs, TemporalExperimentArgs, WorkspaceExperimentArgs,
};
use crate::output::print_serialized;
use anyhow::{bail, Context};
use genos_runtime::{
    analyze_fixed_genome_cohort, apply_cognitive_merge, artificial_select, cognitive_merge,
    evaluate_paired_reproduction, merge_experiences, persist_experiment_report,
    run_branch_evolution, run_bug_investigation, run_incident_search, run_personal_causal_replay,
    run_scientific_experiment, run_security_coevolution, run_temporal_experiment,
    run_workspace_experiment, AgentPrimitive, AgentPrimitiveTrace, BranchEvolutionConfig,
    BranchExperience, BugInvestigationManifest, ClaimRelation, CognitiveClaim,
    CognitiveMergeApplication, CognitiveMergeConfig, CognitiveMergeReport, CohortControls,
    EvolutionBranchSpec, HeredityCohortMember, IncidentSearchManifest, PairedBehaviorTrial,
    PersonalCausalReplayManifest, ReproducibilityThresholds, ScientificExperimentManifest,
    SecurityCoevolutionManifest, SelectionCandidate, SelectionConstraints,
    TemporalExperimentManifest, WorkspaceExperimentManifest,
};
use serde::Deserialize;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
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
    primitives: Vec<AgentPrimitive>,
}

#[derive(Serialize)]
struct ScientificSummaryOutput {
    report_path: String,
    question: String,
    hypotheses: usize,
    recursive_hypotheses: usize,
    critiques: usize,
    reproductions: usize,
    reproduction_mismatches: usize,
    rewinds: usize,
    artifacts: usize,
    primitives: Vec<AgentPrimitive>,
}

#[derive(Serialize)]
struct SecurityCoevolutionSummaryOutput {
    report_path: String,
    worlds: usize,
    generations_per_world: u32,
    recorded_generations: usize,
    red_mutations: usize,
    blue_mutations: usize,
    observer_findings: usize,
    total_genomes_evaluated: usize,
    final_breach_probabilities: Vec<(String, f64)>,
    primitives: Vec<AgentPrimitive>,
}

#[derive(Serialize)]
struct BugInvestigationSummaryOutput {
    report_path: String,
    bug: String,
    hypotheses: usize,
    supported: Vec<String>,
    rejected: Vec<String>,
    selected_fix: Option<String>,
    evidence_records: usize,
    selection_note: String,
    primitives: Vec<AgentPrimitive>,
}

fn primitive_sequence(trace: &AgentPrimitiveTrace) -> Vec<AgentPrimitive> {
    let mut sequence = Vec::new();
    for invocation in &trace.invocations {
        if !sequence.contains(&invocation.primitive) {
            sequence.push(invocation.primitive.clone());
        }
    }
    sequence
}

fn read_manifest<T: DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("reading experiment manifest {}", path.display()))?;
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("yaml" | "yml") => Ok(serde_yaml::from_slice(&bytes)?),
        _ => Ok(serde_json::from_slice(&bytes)?),
    }
}

fn read_value(path: &Path) -> anyhow::Result<Value> {
    read_manifest(path)
}

fn set_object_field(
    value: &mut Value,
    field: &str,
    replacement: Value,
    source: &Path,
) -> anyhow::Result<()> {
    let object = value.as_object_mut().with_context(|| {
        format!(
            "direct experiment plan {} must be a YAML/JSON object",
            source.display()
        )
    })?;
    object.insert(field.to_string(), replacement);
    Ok(())
}

fn deserialize_plan<T: DeserializeOwned>(value: Value, source: &Path) -> anyhow::Result<T> {
    serde_json::from_value(value)
        .with_context(|| format!("validating direct experiment plan {}", source.display()))
}

fn path_value(path: &Path) -> Value {
    Value::String(path.to_string_lossy().into_owned())
}

fn nested_or_whole(mut value: Value, field: &str) -> Value {
    value
        .as_object_mut()
        .and_then(|object| object.remove(field))
        .unwrap_or(value)
}

fn read_dataset(path: &Path) -> anyhow::Result<Vec<String>> {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("yaml" | "yml" | "json") => read_manifest(path),
        _ => {
            let contents = std::fs::read_to_string(path)
                .with_context(|| format!("reading scientific dataset {}", path.display()))?;
            let records: Vec<_> = contents
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .map(str::to_owned)
                .collect();
            if records.is_empty() {
                bail!("scientific dataset {} contains no records", path.display());
            }
            Ok(records)
        }
    }
}

fn workspace_manifest(
    args: &WorkspaceExperimentArgs,
) -> anyhow::Result<WorkspaceExperimentManifest> {
    match (&args.manifest, &args.repo, &args.plan) {
        (Some(manifest_path), None, None) => {
            let mut manifest: WorkspaceExperimentManifest = read_manifest(manifest_path)?;
            if manifest.seed_dir.is_relative() {
                let base = manifest_path.parent().unwrap_or_else(|| Path::new("."));
                manifest.seed_dir = base.join(&manifest.seed_dir);
            }
            Ok(manifest)
        }
        (None, Some(repo), Some(plan_path)) => {
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "seed_dir", path_value(repo), plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _) => bail!("MANIFEST cannot be combined with --repo or --plan"),
        _ => bail!("provide either MANIFEST or both --repo PATH and --plan PATH"),
    }
}

fn incident_manifest(args: &IncidentExperimentArgs) -> anyhow::Result<IncidentSearchManifest> {
    match (
        &args.manifest,
        &args.snapshot,
        &args.evidence,
        &args.search_plan,
    ) {
        (Some(manifest_path), None, None, None) => read_manifest(manifest_path),
        (None, Some(snapshot), Some(evidence_path), Some(plan_path)) => {
            let mut evidence = nested_or_whole(read_value(evidence_path)?, "evidence");
            set_object_field(
                &mut evidence,
                "snapshot_ref",
                Value::String(snapshot.clone()),
                evidence_path,
            )?;
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "evidence", evidence, plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _, _) => {
            bail!("MANIFEST cannot be combined with --snapshot, --evidence, or --search-plan")
        }
        _ => bail!(
            "provide either MANIFEST or --snapshot REF, --evidence PATH, and --search-plan PATH"
        ),
    }
}

fn scientific_manifest(
    args: &ScientificExperimentArgs,
) -> anyhow::Result<ScientificExperimentManifest> {
    match (&args.manifest, &args.dataset, &args.research_plan) {
        (Some(manifest_path), None, None) => read_manifest(manifest_path),
        (None, Some(dataset_path), Some(plan_path)) => {
            let records = serde_json::to_value(read_dataset(dataset_path)?)?;
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "records", records, plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _) => {
            bail!("MANIFEST cannot be combined with --dataset or --research-plan")
        }
        _ => bail!("provide either MANIFEST or both --dataset PATH and --research-plan PATH"),
    }
}

fn security_manifest(
    args: &SecurityCoevolutionArgs,
) -> anyhow::Result<SecurityCoevolutionManifest> {
    match (&args.manifest, &args.environment, &args.evolution_plan) {
        (Some(manifest_path), None, None) => read_manifest(manifest_path),
        (None, Some(environment_path), Some(plan_path)) => {
            let scenarios = nested_or_whole(read_value(environment_path)?, "scenarios");
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "scenarios", scenarios, plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _) => {
            bail!("MANIFEST cannot be combined with --environment or --evolution-plan")
        }
        _ => bail!("provide either MANIFEST or both --environment PATH and --evolution-plan PATH"),
    }
}

fn bug_manifest(args: &BugInvestigationArgs) -> anyhow::Result<BugInvestigationManifest> {
    match (&args.manifest, &args.repo, &args.plan) {
        (Some(manifest_path), None, None) => {
            let mut manifest: BugInvestigationManifest = read_manifest(manifest_path)?;
            if manifest.seed_dir.is_relative() {
                let base = manifest_path.parent().unwrap_or_else(|| Path::new("."));
                manifest.seed_dir = base.join(&manifest.seed_dir);
            }
            Ok(manifest)
        }
        (None, Some(repo), Some(plan_path)) => {
            let mut plan = read_value(plan_path)?;
            set_object_field(&mut plan, "seed_dir", path_value(repo), plan_path)?;
            deserialize_plan(plan, plan_path)
        }
        (Some(_), _, _) => bail!("MANIFEST cannot be combined with --repo or --plan"),
        _ => bail!("provide either MANIFEST or both --repo PATH and --plan PATH"),
    }
}

#[derive(Deserialize)]
struct HeredityManifest {
    controls: CohortControls,
    members: Vec<HeredityCohortMember>,
}

#[derive(Deserialize)]
struct SelectionManifest {
    constraints: SelectionConstraints,
    candidates: Vec<SelectionCandidate>,
}

#[derive(Deserialize)]
struct ReproducibilityManifest {
    thresholds: ReproducibilityThresholds,
    trials: Vec<PairedBehaviorTrial>,
}

#[derive(Deserialize)]
struct CognitiveMergeManifest {
    #[serde(default)]
    claims: Vec<CognitiveClaim>,
    #[serde(default)]
    experiences: Vec<BranchExperience>,
    #[serde(default)]
    relations: Vec<ClaimRelation>,
    #[serde(default)]
    config: CognitiveMergeConfig,
    parent_snapshot: Option<genos_core::AgentSnapshot>,
}

#[derive(Deserialize)]
struct BranchEvolutionManifest {
    config: BranchEvolutionConfig,
    branches: Vec<EvolutionBranchSpec>,
}

#[derive(Serialize)]
struct CognitiveMergeOutput {
    report: CognitiveMergeReport,
    application: Option<CognitiveMergeApplication>,
}

pub fn cmd_experiment_heredity(args: GenericExperimentArgs) -> anyhow::Result<()> {
    let manifest: HeredityManifest = read_manifest(&args.manifest)?;
    let report = analyze_fixed_genome_cohort(manifest.controls, &manifest.members)
        .map_err(anyhow::Error::msg)?;
    print_serialized(&report, args.format)
}

pub fn cmd_experiment_select(args: GenericExperimentArgs) -> anyhow::Result<()> {
    let manifest: SelectionManifest = read_manifest(&args.manifest)?;
    print_serialized(
        &artificial_select(&manifest.candidates, &manifest.constraints),
        args.format,
    )
}

pub fn cmd_experiment_reproducibility(args: GenericExperimentArgs) -> anyhow::Result<()> {
    let manifest: ReproducibilityManifest = read_manifest(&args.manifest)?;
    let report = evaluate_paired_reproduction(&manifest.trials, &manifest.thresholds)
        .map_err(anyhow::Error::msg)?;
    print_serialized(&report, args.format)
}

pub fn cmd_experiment_cognitive_merge(args: GenericExperimentArgs) -> anyhow::Result<()> {
    let manifest: CognitiveMergeManifest = read_manifest(&args.manifest)?;
    let report = match (manifest.claims.is_empty(), manifest.experiences.is_empty()) {
        (false, true) => cognitive_merge(&manifest.claims, &manifest.relations, &manifest.config),
        (true, false) => {
            merge_experiences(&manifest.experiences, &manifest.relations, &manifest.config)
        }
        _ => Err("provide exactly one of claims or experiences".to_string()),
    }
    .map_err(anyhow::Error::msg)?;
    let application = manifest
        .parent_snapshot
        .as_ref()
        .map(|parent| apply_cognitive_merge(parent, &report));
    print_serialized(
        &CognitiveMergeOutput {
            report,
            application,
        },
        args.format,
    )
}

pub fn cmd_experiment_branch_evolution(args: GenericExperimentArgs) -> anyhow::Result<()> {
    let manifest: BranchEvolutionManifest = read_manifest(&args.manifest)?;
    let report =
        run_branch_evolution(&manifest.branches, &manifest.config).map_err(anyhow::Error::msg)?;
    print_serialized(&report, args.format)
}

pub async fn cmd_experiment_workspace(args: WorkspaceExperimentArgs) -> anyhow::Result<()> {
    let manifest = workspace_manifest(&args)?;
    let name = manifest.name.clone();
    let experiment_root = args.root.join(&name);
    let report = run_workspace_experiment(manifest, &experiment_root).await?;
    let report_path = persist_experiment_report(&experiment_root, &name, &report)?;
    print_serialized(
        &ExperimentRunOutput {
            report_path: report_path.display().to_string(),
            report,
        },
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
        &ExperimentRunOutput {
            report_path: report_path.display().to_string(),
            report,
        },
        args.format,
    )
}

pub fn cmd_experiment_causal_replay(args: TemporalExperimentArgs) -> anyhow::Result<()> {
    let manifest: PersonalCausalReplayManifest = read_manifest(&args.manifest)?;
    let name = manifest.name.clone();
    let experiment_root = args.root.join(&name);
    let report = run_personal_causal_replay(manifest).map_err(anyhow::Error::msg)?;
    let report_path = persist_experiment_report(&experiment_root, &name, &report)?;
    print_serialized(
        &ExperimentRunOutput {
            report_path: report_path.display().to_string(),
            report,
        },
        args.format,
    )
}

pub fn cmd_experiment_incident(args: IncidentExperimentArgs) -> anyhow::Result<()> {
    let manifest = incident_manifest(&args)?;
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
                perfect_branch_ids: report
                    .perfect_reproduction_ids
                    .into_iter()
                    .map(|id| id.0)
                    .collect(),
                primitives: primitive_sequence(&report.primitive_trace),
            },
            args.format,
        )
    } else {
        print_serialized(
            &ExperimentRunOutput {
                report_path: report_path.display().to_string(),
                report,
            },
            args.format,
        )
    }
}

pub fn cmd_experiment_scientific(args: ScientificExperimentArgs) -> anyhow::Result<()> {
    let manifest = scientific_manifest(&args)?;
    let name = manifest.name.clone();
    let experiment_root = args.root.join(&name);
    let report = run_scientific_experiment(manifest)?;
    let report_path = persist_experiment_report(&experiment_root, &name, &report)?;
    if args.summary {
        print_serialized(
            &ScientificSummaryOutput {
                report_path: report_path.display().to_string(),
                question: report.question,
                hypotheses: report.hypotheses.len(),
                recursive_hypotheses: report
                    .hypotheses
                    .iter()
                    .filter(|hypothesis| hypothesis.parent_hypothesis_id.as_deref() == Some("H3"))
                    .count(),
                critiques: report
                    .hypotheses
                    .iter()
                    .map(|hypothesis| hypothesis.critiques.len())
                    .sum(),
                reproductions: report.reproductions.len(),
                reproduction_mismatches: report
                    .reproductions
                    .iter()
                    .filter(|reproduction| !reproduction.consistent)
                    .count(),
                rewinds: report.rewinds.len(),
                artifacts: report.artifacts.len(),
                primitives: primitive_sequence(&report.primitive_trace),
            },
            args.format,
        )
    } else {
        print_serialized(
            &ExperimentRunOutput {
                report_path: report_path.display().to_string(),
                report,
            },
            args.format,
        )
    }
}

pub fn cmd_experiment_security_coevolution(args: SecurityCoevolutionArgs) -> anyhow::Result<()> {
    let manifest = security_manifest(&args)?;
    let name = manifest.name.clone();
    let experiment_root = args.root.join(&name);
    let report = run_security_coevolution(manifest)?;
    let report_path = persist_experiment_report(&experiment_root, &name, &report)?;
    if args.summary {
        let final_breach_probabilities = report
            .evolution
            .iter()
            .filter(|generation| generation.generation == report.generations_requested)
            .map(|generation| {
                (
                    generation.scenario_id.clone(),
                    generation.observer_finding.breach_probability,
                )
            })
            .collect();
        print_serialized(
            &SecurityCoevolutionSummaryOutput {
                report_path: report_path.display().to_string(),
                worlds: report.initial_worlds.len(),
                generations_per_world: report.generations_requested,
                recorded_generations: report.evolution.len(),
                red_mutations: report
                    .evolution
                    .iter()
                    .map(|generation| generation.red_candidates.len())
                    .sum(),
                blue_mutations: report
                    .evolution
                    .iter()
                    .map(|generation| generation.blue_candidates.len())
                    .sum(),
                observer_findings: report.evolution.len(),
                total_genomes_evaluated: report.total_genomes_evaluated,
                final_breach_probabilities,
                primitives: primitive_sequence(&report.primitive_trace),
            },
            args.format,
        )
    } else {
        print_serialized(
            &ExperimentRunOutput {
                report_path: report_path.display().to_string(),
                report,
            },
            args.format,
        )
    }
}

pub async fn cmd_experiment_bug_investigation(args: BugInvestigationArgs) -> anyhow::Result<()> {
    let manifest = bug_manifest(&args)?;
    let name = manifest.name.clone();
    let experiment_root = args.root.join(&name);
    let report = run_bug_investigation(manifest, &experiment_root).await?;
    let report_path = persist_experiment_report(&experiment_root, &name, &report)?;
    if args.summary {
        let supported = report
            .investigations
            .iter()
            .filter(|investigation| {
                investigation.verdict == genos_runtime::HypothesisVerdict::Supported
            })
            .map(|investigation| investigation.hypothesis_id.clone())
            .collect();
        let selected_fix = report
            .selected_fix
            .as_ref()
            .map(|fix| fix.hypothesis_id.clone());
        print_serialized(
            &BugInvestigationSummaryOutput {
                report_path: report_path.display().to_string(),
                bug: report.bug,
                hypotheses: report.investigations.len(),
                supported,
                rejected: report.rejected_hypothesis_ids,
                selected_fix,
                evidence_records: report.baseline_evidence.len()
                    + report
                        .investigations
                        .iter()
                        .map(|investigation| investigation.evidence.len())
                        .sum::<usize>(),
                selection_note: report.selection_note,
                primitives: primitive_sequence(&report.primitive_trace),
            },
            args.format,
        )
    } else {
        print_serialized(
            &ExperimentRunOutput {
                report_path: report_path.display().to_string(),
                report,
            },
            args.format,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::args::OutputFormat;

    #[test]
    fn direct_workspace_mode_rejects_partial_and_mixed_inputs() {
        let partial = WorkspaceExperimentArgs {
            manifest: None,
            repo: Some(Path::new("repo").to_path_buf()),
            plan: None,
            root: Path::new(".genos/experiments").to_path_buf(),
            format: OutputFormat::Json,
        };
        assert!(workspace_manifest(&partial)
            .unwrap_err()
            .to_string()
            .contains("both --repo PATH and --plan PATH"));

        let mixed = WorkspaceExperimentArgs {
            manifest: Some(Path::new("manifest.yaml").to_path_buf()),
            repo: Some(Path::new("repo").to_path_buf()),
            plan: None,
            root: Path::new(".genos/experiments").to_path_buf(),
            format: OutputFormat::Json,
        };
        assert!(workspace_manifest(&mixed)
            .unwrap_err()
            .to_string()
            .contains("cannot be combined"));
    }

    #[test]
    fn text_dataset_ignores_blank_lines() {
        let path = std::env::temp_dir().join(format!(
            "genos-dataset-{}-{}.txt",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::write(&path, "alpha\n\n beta \n").unwrap();
        let records = read_dataset(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(records, vec!["alpha", "beta"]);
    }
}
