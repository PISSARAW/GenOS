use super::manifest::*;
use crate::args::{
    BugInvestigationArgs, IncidentExperimentArgs, ScientificExperimentArgs,
    SecurityCoevolutionArgs, TemporalExperimentArgs, WorkspaceExperimentArgs,
};
use crate::output::print_serialized;
use genos_runtime::{
    persist_experiment_report, run_bug_investigation, run_incident_search,
    run_personal_causal_replay, run_scientific_experiment, run_security_coevolution,
    run_temporal_experiment, run_workspace_experiment, PersonalCausalReplayManifest,
    TemporalExperimentManifest,
};

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
