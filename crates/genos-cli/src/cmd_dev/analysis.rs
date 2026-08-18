use super::helpers::*;
use crate::args::*;
use anyhow::{anyhow, Result};
use chrono::Utc;
use genos_core::*;
use serde::Serialize;
use serde_json::json;
use std::fs;

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
