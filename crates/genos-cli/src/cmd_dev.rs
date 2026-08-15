use crate::args::*;
use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use genos_core::*;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
};

fn dev_dir(root: &Path) -> PathBuf {
    root.join("dev")
}

fn ledger(root: &Path, name: &str) -> PathBuf {
    dev_dir(root).join(format!("{name}.json"))
}

fn read_vec<T: DeserializeOwned>(path: &Path) -> Result<Vec<T>> {
    if !path.exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&fs::read(path)?).with_context(|| format!("read {}", path.display()))
}

fn save_vec<T: Serialize>(path: &Path, values: &[T]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec_pretty(values)?)?;
    Ok(())
}

fn save_one<T: Serialize>(root: &Path, collection: &str, id: &str, value: &T) -> Result<PathBuf> {
    let path = dev_dir(root).join(collection).join(format!("{id}.json"));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_vec_pretty(value)?)?;
    Ok(path)
}

fn read_one<T: DeserializeOwned>(root: &Path, collection: &str, id: &str) -> Result<T> {
    if id.is_empty()
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        return Err(anyhow!("invalid {collection} id '{id}'"));
    }
    let path = dev_dir(root).join(collection).join(format!("{id}.json"));
    serde_json::from_slice(
        &fs::read(&path).with_context(|| format!("unknown {collection} id '{id}'"))?,
    )
    .with_context(|| format!("parse {}", path.display()))
}

fn output(value: impl Serialize) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(&value)?);
    Ok(())
}

fn unique_id(prefix: &str) -> String {
    format!("{prefix}_{}", Utc::now().timestamp_micros())
}

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

pub fn cmd_record_decision(args: RecordDecisionArgs) -> Result<()> {
    let mut record = DecisionRecord::new(args.title);
    record.alternatives = args.alternatives;
    record.evidence = args.evidence;
    record.assumptions = args.assumptions;
    record.code_refs = args.code_refs;
    record.test_refs = args.test_refs;
    record.requirement_refs = args.requirement_refs;
    record.expected = args.expected;
    record.observed = args.observed;
    record.parent_hypothesis = args.parent_hypothesis;
    if record.observed.is_some() && record.expected != record.observed {
        record.status = "questionable".into();
    }
    let path = ledger(&args.root, "decisions");
    let mut records: Vec<DecisionRecord> = read_vec(&path)?;
    records.push(record.clone());
    save_vec(&path, &records)?;
    output(&record)
}

pub fn cmd_blame(args: BlameArgs) -> Result<()> {
    let records: Vec<DecisionRecord> = read_vec(&ledger(&args.root, "decisions"))?;
    let needle = args.reference.to_lowercase();
    let matches: Vec<_> = records
        .into_iter()
        .filter(|d| {
            d.id.to_lowercase().contains(&needle)
                || d.title.to_lowercase().contains(&needle)
                || d.code_refs
                    .iter()
                    .chain(&d.test_refs)
                    .chain(&d.requirement_refs)
                    .any(|r| r.to_lowercase().contains(&needle))
        })
        .collect();
    output(json!({"reference": args.reference, "decisions": matches}))
}

pub fn cmd_invalidate_assumption(args: InvalidateAssumptionArgs) -> Result<()> {
    let path = ledger(&args.root, "decisions");
    let mut records: Vec<DecisionRecord> = read_vec(&path)?;
    let needle = args.assumption.to_lowercase();
    let mut affected = Vec::new();
    for record in &mut records {
        if record
            .assumptions
            .iter()
            .any(|assumption| assumption.to_lowercase().contains(&needle))
        {
            record.status = "assumption_invalidated".into();
            affected.push(json!({
                "decision_id": record.id,
                "title": record.title,
                "code_refs": record.code_refs,
                "test_refs": record.test_refs,
                "requirement_refs": record.requirement_refs,
            }));
        }
    }
    save_vec(&path, &records)?;
    output(json!({
        "assumption": args.assumption,
        "observed": args.observed,
        "status": "invalidated",
        "affected": affected,
    }))
}

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

pub fn cmd_adversarial_review(args: AdversarialReviewArgs) -> Result<()> {
    let plan = ReviewPlan {
        id: unique_id("review"),
        target: args.target,
        blind: args.blind,
        critics: if args.critics.is_empty() {
            vec![
                "security".into(),
                "correctness".into(),
                "performance".into(),
                "concurrency".into(),
            ]
        } else {
            args.critics
        },
        worlds: if args.worlds.is_empty() {
            vec!["current".into()]
        } else {
            args.worlds
        },
        rounds: args.rounds,
        created_at: Utc::now(),
    };
    let path = ledger(&args.root, "reviews");
    let mut plans: Vec<ReviewPlan> = read_vec(&path)?;
    plans.push(plan.clone());
    save_vec(&path, &plans)?;
    output(&plan)
}

pub fn cmd_future_ci(args: FutureCiArgs) -> Result<()> {
    if args.migration_from.is_some() != args.migration_to.is_some() {
        return Err(anyhow!(
            "migration_from and migration_to must be supplied together"
        ));
    }
    let plan = FutureCiPlan {
        id: unique_id("future"),
        target: args.target,
        worlds: args.worlds,
        agents: if args.agents.is_empty() {
            vec!["regression".into(), "security".into(), "performance".into()]
        } else {
            args.agents
        },
        dependency: args.dependency,
        migration_from: args.migration_from,
        migration_to: args.migration_to,
        created_at: Utc::now(),
    };
    let path = ledger(&args.root, "future-ci");
    let mut plans: Vec<FutureCiPlan> = read_vec(&path)?;
    plans.push(plan.clone());
    save_vec(&path, &plans)?;
    output(&plan)
}

pub fn cmd_repository_genome(args: RepositoryGenomeArgs) -> Result<()> {
    let path = dev_dir(&args.root).join("project.genome.json");
    let mut genome: RepositoryGenome = if path.exists() {
        serde_json::from_slice(&fs::read(&path)?)?
    } else {
        Default::default()
    };
    macro_rules! extend_unique {
        ($field:ident, $values:expr) => {
            for value in $values {
                if !genome.$field.contains(&value) {
                    genome.$field.push(value);
                }
            }
        };
    }
    extend_unique!(architecture, args.architecture);
    extend_unique!(conventions, args.conventions);
    extend_unique!(invariants, args.invariants);
    extend_unique!(security_rules, args.security_rules);
    extend_unique!(testing_policy, args.testing_policy);
    extend_unique!(performance_requirements, args.performance_requirements);
    extend_unique!(domain_language, args.domain_language);
    extend_unique!(forbidden_patterns, args.forbidden_patterns);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_vec_pretty(&genome)?)?;
    output(json!({"genome": genome, "path": path}))
}

pub fn cmd_bisect_agent(args: BisectAgentArgs) -> Result<()> {
    let parsed: Result<Vec<(String, bool)>> = args
        .states
        .into_iter()
        .map(|state| {
            let (label, status) = state
                .split_once('=')
                .ok_or_else(|| anyhow!("state must be label=good|bad"))?;
            let good = match status {
                "good" | "pass" => true,
                "bad" | "fail" => false,
                _ => return Err(anyhow!("state status must be good or bad")),
            };
            Ok((label.to_string(), good))
        })
        .collect();
    let parsed = parsed?;
    let first_bad = parsed.iter().position(|(_, good)| !good);
    let last_good = first_bad
        .and_then(|index| index.checked_sub(1))
        .map(|index| parsed[index].0.clone());
    output(
        json!({"dimension": args.dimension, "first_bad": first_bad.map(|i| parsed[i].0.clone()), "last_good": last_good,
        "search_interval": first_bad.map(|i| [i.saturating_sub(1), i]), "states": parsed}),
    )
}

pub fn cmd_analyze_trajectory(args: AnalyzeTrajectoryArgs) -> Result<()> {
    #[derive(Clone, Serialize)]
    struct Step {
        snapshot: String,
        good: bool,
        action: String,
        belief: String,
    }
    let steps: Result<Vec<Step>> = args
        .steps
        .into_iter()
        .map(|raw| {
            let parts: Vec<_> = raw.split('|').collect();
            if parts.len() != 4 {
                return Err(anyhow!(
                    "step must be snapshot|good|action_signature|belief_signature"
                ));
            }
            let good = match parts[1] {
                "good" | "pass" => true,
                "bad" | "fail" => false,
                _ => return Err(anyhow!("step status must be good or bad")),
            };
            Ok(Step {
                snapshot: parts[0].into(),
                good,
                action: parts[2].into(),
                belief: parts[3].into(),
            })
        })
        .collect();
    let steps = steps?;
    let first_bad = steps.iter().position(|step| !step.good);
    let last_good = first_bad
        .and_then(|index| index.checked_sub(1))
        .map(|index| steps[index].snapshot.clone());
    let stuck = steps.windows(3).any(|window| {
        !window[0].good
            && !window[1].good
            && !window[2].good
            && window[0].action == window[1].action
            && window[1].action == window[2].action
    });
    let cognitive_loop = steps
        .windows(2)
        .any(|window| window[0].belief == window[1].belief && window[0].action == window[1].action);
    output(json!({
        "first_bad": first_bad.map(|index| steps[index].snapshot.clone()),
        "last_good": last_good,
        "recommended_revert": last_good,
        "stuck": stuck,
        "cognitive_loop": cognitive_loop,
        "recommendation": if stuck || cognitive_loop { "fork_from_last_good_with_new_hypotheses" } else { "continue_with_verification" },
        "steps": steps,
    }))
}

pub fn cmd_compile_memory(args: CompileMemoryArgs) -> Result<()> {
    let compiled = CompiledMemory {
        active: args
            .facts
            .iter()
            .chain(&args.constraints)
            .cloned()
            .collect(),
        facts: args.facts,
        decisions: args.decisions,
        failures: args.failures,
        constraints: args.constraints,
        open_questions: args.open_questions,
        source_refs: args.source_refs,
    };
    let path = dev_dir(&args.root).join("compiled-memory.json");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, serde_json::to_vec_pretty(&compiled)?)?;
    output(json!({"memory": compiled, "path": path}))
}
