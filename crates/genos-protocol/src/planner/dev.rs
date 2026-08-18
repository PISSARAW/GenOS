use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_dev(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "diagnose" => plan_diagnose(planner)?,
        "solve" => plan_solve(planner)?,
        "hypothesis_evidence" => plan_hypothesis_evidence(planner)?,
        "evaluate_trajectories" => plan_evaluate_trajectories(planner)?,
        "record_decision" => plan_record_decision(planner)?,
        "blame" | "search_failures" => plan_blame_or_search_failures(planner)?,
        "invalidate_assumption" => plan_invalidate_assumption(planner)?,
        "record_experience" => plan_record_experience(planner)?,
        "cherry_pick_experience" => plan_cherry_pick_experience(planner)?,
        "adversarial_review" => plan_adversarial_review(planner)?,
        "future_ci" => plan_future_ci(planner)?,
        "repository_genome" => plan_repository_genome(planner)?,
        "bisect_agent" => plan_bisect_agent(planner)?,
        "analyze_trajectory" => plan_analyze_trajectory(planner)?,
        "compile_memory" => plan_compile_memory(planner)?,
        _ => return Ok(false),
    }
    Ok(true)
}

fn plan_diagnose(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args.push(planner.req_str("problem")?.into());
    planner.push_req_strings("hypotheses", "--hypothesis")?;
    planner.push_root("--root")?;
    Ok(())
}

fn plan_solve(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args.push(planner.req_str("problem")?.into());
    planner.push_strings("strategies", "--strategy")?;
    planner.push_usize_with_default("branches", ("--branches", 8))?;
    if planner.opt_bool("minimal_patch")?.unwrap_or(false) {
        planner.args.push("--minimal-patch".into());
    }
    planner.push_root("--root")?;
    Ok(())
}

fn plan_hypothesis_evidence(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "hypothesis-evidence".into();
    planner.args.push(planner.req_str("diagnosis_id")?.into());
    planner.args.push(planner.req_str("hypothesis_id")?.into());
    for (key, flag) in [("claim", "--claim"), ("source", "--source")] {
        planner.push_flag(flag, planner.req_str(key)?);
    }
    if let Some(v) = planner.opt_str("artifact")? {
        planner.push_flag("--artifact", v);
    }
    if planner.opt_bool("against")?.unwrap_or(false) {
        planner.args.push("--against".into());
    }
    planner.push_number("confidence", "--confidence")?;
    planner.push_root("--root")?;
    Ok(())
}

fn plan_evaluate_trajectories(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "evaluate-trajectories".into();
    planner.args.push(planner.req_str("solve_id")?.into());
    planner.push_req_strings("scores", "--score")?;
    planner.push_usize_with_default("keep", ("--keep", 2))?;
    planner.push_root("--root")?;
    Ok(())
}

fn plan_record_decision(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "record-decision".into();
    planner.args.push(planner.req_str("title")?.into());
    for (key, flag) in [
        ("alternatives", "--alternative"),
        ("evidence", "--evidence"),
        ("assumptions", "--assumption"),
        ("code_refs", "--code-ref"),
        ("test_refs", "--test-ref"),
        ("requirement_refs", "--requirement-ref"),
    ] {
        planner.push_strings(key, flag)?;
    }
    for (key, flag) in [
        ("expected", "--expected"),
        ("observed", "--observed"),
        ("parent_hypothesis", "--parent-hypothesis"),
    ] {
        if let Some(v) = planner.opt_str(key)? {
            planner.push_flag(flag, v);
        }
    }
    planner.push_root("--root")?;
    Ok(())
}

fn plan_blame_or_search_failures(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = planner.operation.replace('_', "-");
    let key = if planner.operation == "blame" {
        "reference"
    } else {
        "query"
    };
    planner.args.push(planner.req_str(key)?.into());
    planner.push_root("--root")?;
    Ok(())
}

fn plan_invalidate_assumption(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "invalidate-assumption".into();
    planner.args.push(planner.req_str("assumption")?.into());
    planner.push_flag("--observed", planner.req_str("observed")?);
    planner.push_root("--root")?;
    Ok(())
}

fn plan_record_experience(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "record-experience".into();
    planner.args.push(planner.req_str("strategy")?.into());
    for (key, flag) in [("context", "--context"), ("outcome", "--outcome")] {
        planner.push_flag(flag, planner.req_str(key)?);
    }
    if planner.req_bool("successful")? {
        planner.args.push("--successful".into());
    }
    planner.push_strings("evidence", "--evidence")?;
    if let Some(v) = planner.opt_str("source_branch")? {
        planner.push_flag("--source-branch", v);
    }
    planner.push_root("--root")?;
    Ok(())
}

fn plan_cherry_pick_experience(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "cherry-pick-experience".into();
    planner.args.push(planner.req_str("experience_id")?.into());
    planner.push_flag("--to-branch", planner.req_str("to_branch")?);
    planner.push_root("--root")?;
    Ok(())
}

fn plan_adversarial_review(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "adversarial-review".into();
    planner.args.push(planner.req_str("target")?.into());
    planner.push_strings("critics", "--critic")?;
    planner.push_strings("worlds", "--world")?;
    planner.push_usize_with_default("rounds", ("--rounds", 1))?;
    planner.push_flag(
        "--blind",
        if planner.opt_bool("blind")?.unwrap_or(true) {
            "true"
        } else {
            "false"
        },
    );
    planner.push_root("--root")?;
    Ok(())
}

fn plan_future_ci(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "future-ci".into();
    planner.args.push(planner.req_str("target")?.into());
    planner.push_req_strings("worlds", "--world")?;
    planner.push_strings("agents", "--agent")?;
    for (key, flag) in [
        ("dependency", "--dependency"),
        ("migration_from", "--migration-from"),
        ("migration_to", "--migration-to"),
    ] {
        if let Some(v) = planner.opt_str(key)? {
            planner.push_flag(flag, v);
        }
    }
    planner.push_root("--root")?;
    Ok(())
}

fn plan_repository_genome(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "repository-genome".into();
    for (key, flag) in [
        ("architecture", "--architecture"),
        ("conventions", "--convention"),
        ("invariants", "--invariant"),
        ("security_rules", "--security-rule"),
        ("testing_policy", "--testing-policy"),
        ("performance_requirements", "--performance-requirement"),
        ("domain_language", "--domain-term"),
        ("forbidden_patterns", "--forbidden-pattern"),
    ] {
        planner.push_strings(key, flag)?;
    }
    planner.push_root("--root")?;
    Ok(())
}

fn plan_bisect_agent(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "bisect-agent".into();
    planner.push_req_strings("states", "--state")?;
    if let Some(v) = planner.opt_str("dimension")? {
        planner.push_flag("--dimension", v);
    }
    Ok(())
}

fn plan_analyze_trajectory(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "analyze-trajectory".into();
    planner.push_req_strings("steps", "--step")?;
    Ok(())
}

fn plan_compile_memory(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args[0] = "dev".into();
    planner.args[1] = "compile-memory".into();
    for (key, flag) in [
        ("facts", "--fact"),
        ("decisions", "--decision"),
        ("failures", "--failure"),
        ("constraints", "--constraint"),
        ("open_questions", "--open-question"),
        ("source_refs", "--source-ref"),
    ] {
        planner.push_strings(key, flag)?;
    }
    planner.push_root("--root")?;
    Ok(())
}
