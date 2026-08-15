use crate::args::{
    BugInvestigationArgs, GenericExperimentArgs, IncidentExperimentArgs, ScientificExperimentArgs,
    SecurityCoevolutionArgs, TemporalExperimentArgs, WorkspaceExperimentArgs,
};
use crate::output::print_serialized;
use anyhow::Context;
use genos_runtime::{
    analyze_fixed_genome_cohort, apply_cognitive_merge, artificial_select, cognitive_merge,
    evaluate_paired_reproduction, merge_experiences, persist_experiment_report,
    run_branch_evolution, run_bug_investigation, run_incident_search, run_personal_causal_replay,
    run_scientific_experiment, run_security_coevolution, run_temporal_experiment,
    run_workspace_experiment, BranchEvolutionConfig, BranchExperience, BugInvestigationManifest,
    ClaimRelation, CognitiveClaim, CognitiveMergeApplication, CognitiveMergeConfig,
    CognitiveMergeReport, CohortControls, EvolutionBranchSpec, HeredityCohortMember,
    IncidentSearchManifest, PairedBehaviorTrial, PersonalCausalReplayManifest,
    ReproducibilityThresholds, ScientificExperimentManifest, SecurityCoevolutionManifest,
    SelectionCandidate, SelectionConstraints, TemporalExperimentManifest,
    WorkspaceExperimentManifest,
};
use serde::Deserialize;
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
}

fn read_manifest<T: DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("reading experiment manifest {}", path.display()))?;
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("yaml" | "yml") => Ok(serde_yaml::from_slice(&bytes)?),
        _ => Ok(serde_json::from_slice(&bytes)?),
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
                perfect_branch_ids: report
                    .perfect_reproduction_ids
                    .into_iter()
                    .map(|id| id.0)
                    .collect(),
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
    let manifest: ScientificExperimentManifest = read_manifest(&args.manifest)?;
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
    let manifest: SecurityCoevolutionManifest = read_manifest(&args.manifest)?;
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
    let mut manifest: BugInvestigationManifest = read_manifest(&args.manifest)?;
    if manifest.seed_dir.is_relative() {
        let base = args.manifest.parent().unwrap_or_else(|| Path::new("."));
        manifest.seed_dir = base.join(&manifest.seed_dir);
    }
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
