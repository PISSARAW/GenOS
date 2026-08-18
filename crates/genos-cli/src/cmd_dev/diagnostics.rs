use super::helpers::*;
use crate::args::*;
use anyhow::{anyhow, Context, Result};
use genos_core::*;
use serde_json::json;

pub fn cmd_diagnose(args: DiagnoseArgs) -> Result<()> {
    let tree = HypothesisTree::new(args.problem, args.hypotheses);
    let path = save_one(&args.root, "diagnoses", &tree.id, &tree)?;
    output(json!({"diagnosis": tree, "path": path}))
}

pub fn cmd_solve(args: SolveArgs) -> Result<()> {
    let strategies = if args.strategies.is_empty() {
        let defaults = [
            "minimal patch",
            "refactoring",
            "algorithm",
            "data layer",
            "concurrency",
            "cache",
            "architecture",
            "challenge assumptions",
        ];
        (0..args.branches)
            .map(|i| defaults[i % defaults.len()].to_string())
            .collect()
    } else {
        args.strategies
    };
    let run = SolveRun::new(args.problem, strategies, args.minimal_patch);
    let path = save_one(&args.root, "solves", &run.id, &run)?;
    output(json!({"solve": run, "path": path}))
}

pub fn cmd_hypothesis_evidence(args: HypothesisEvidenceArgs) -> Result<()> {
    let mut tree: HypothesisTree = read_one(&args.root, "diagnoses", &args.diagnosis_id)?;
    let hypothesis = tree
        .hypotheses
        .get_mut(&args.hypothesis_id)
        .ok_or_else(|| anyhow!("unknown hypothesis id '{}'", args.hypothesis_id))?;
    if !(0.0..=1.0).contains(&args.confidence) {
        return Err(anyhow!("confidence must be between 0 and 1"));
    }
    hypothesis.confidence = args.confidence;
    hypothesis.status = if args.against && args.confidence <= 0.2 {
        HypothesisStatus::Falsified
    } else if !args.against && args.confidence >= 0.8 {
        HypothesisStatus::Supported
    } else {
        HypothesisStatus::Testing
    };
    hypothesis.evidence.push(DevEvidenceRef {
        claim: args.claim,
        source: args.source,
        supports: !args.against,
        artifact: args.artifact,
    });
    save_one(&args.root, "diagnoses", &tree.id, &tree)?;
    output(&tree)
}

pub fn cmd_evaluate_trajectories(args: EvaluateTrajectoriesArgs) -> Result<()> {
    let mut run: SolveRun = read_one(&args.root, "solves", &args.solve_id)?;
    for score in args.scores {
        let (id, value) = score
            .split_once('=')
            .ok_or_else(|| anyhow!("score must be trajectory_id=number"))?;
        let trajectory = run
            .trajectories
            .iter_mut()
            .find(|t| t.id == id)
            .ok_or_else(|| anyhow!("unknown trajectory id '{id}'"))?;
        trajectory.score = value.parse().context("score must be a number")?;
    }
    run.allocate_and_prune(args.keep.max(1));
    save_one(&args.root, "solves", &run.id, &run)?;
    output(&run)
}
