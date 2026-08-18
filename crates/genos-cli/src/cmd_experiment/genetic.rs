use super::manifest::*;
use crate::args::GenericExperimentArgs;
use crate::output::print_serialized;
use genos_runtime::{
    analyze_fixed_genome_cohort, apply_cognitive_merge, artificial_select, cognitive_merge,
    evaluate_paired_reproduction, merge_experiences, run_branch_evolution,
};

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
