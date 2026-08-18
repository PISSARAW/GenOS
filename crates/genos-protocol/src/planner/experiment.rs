use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_experiment(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "workspace_experiment" => plan_workspace(planner)?,
        "causal_replay_experiment" => plan_causal_replay(planner)?,
        "incident_experiment" => plan_incident(planner)?,
        "scientific_experiment" => plan_scientific(planner)?,
        "security_coevolution" => plan_security_coevolution(planner)?,
        "bug_investigation" => plan_bug_investigation(planner)?,
        _ => return Ok(false),
    }
    Ok(true)
}

fn plan_workspace(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args = vec!["experiment".into(), "workspace".into()];
    planner.push_manifest_or_pair(("repo", "--repo"), ("plan", "--plan"))?;
    planner.push_opt_experiment_root()?;
    planner.push_flag("--format", "json");
    Ok(())
}

fn plan_causal_replay(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args = vec!["experiment".into(), "causal-replay".into()];
    planner.args.push(planner.req_str("manifest")?.into());
    planner.push_opt_experiment_root()?;
    planner.push_flag("--format", "json");
    Ok(())
}

fn plan_incident(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args = vec!["experiment".into(), "incident".into()];
    planner.push_manifest_or_triplet([
        ("snapshot", "--snapshot"),
        ("evidence", "--evidence"),
        ("search_plan", "--search-plan"),
    ])?;
    planner.push_experiment_tail()?;
    Ok(())
}

fn plan_scientific(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args = vec!["experiment".into(), "scientific".into()];
    planner.push_manifest_or_pair(("dataset", "--dataset"), ("research_plan", "--research-plan"))?;
    planner.push_experiment_tail()?;
    Ok(())
}

fn plan_security_coevolution(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args = vec!["experiment".into(), "security-coevolution".into()];
    planner.push_manifest_or_pair(
        ("environment", "--environment"),
        ("evolution_plan", "--evolution-plan"),
    )?;
    planner.push_experiment_tail()?;
    Ok(())
}

fn plan_bug_investigation(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args = vec!["experiment".into(), "bug-investigation".into()];
    planner.push_manifest_or_pair(("repo", "--repo"), ("plan", "--plan"))?;
    planner.push_experiment_tail()?;
    Ok(())
}
