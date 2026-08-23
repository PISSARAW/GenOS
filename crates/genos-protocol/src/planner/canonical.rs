use serde_json::Value;

use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_canonical(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "create" => plan_create(planner)?,
        "snapshot" | "restore" => plan_snapshot_or_restore(planner)?,
        "fork" => plan_fork(planner)?,
        "run" => plan_run(planner)?,
        "inspect" => plan_inspect(planner)?,
        "diff" => plan_diff(planner)?,
        "lineage" => plan_lineage(planner)?,
        "replay" => plan_replay(planner)?,
        "merge" => plan_merge(planner)?,
        _ => return Ok(false),
    }
    Ok(true)
}

fn plan_create(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.push_flag("--name", planner.req_str("name")?);
    planner.push_flag("--role", planner.req_str("role")?);
    if let Some(out) = planner.opt_str("out")? {
        planner.push_flag("--out", out);
    }
    planner.push_flag("--format", "json");
    Ok(())
}

fn plan_snapshot_or_restore(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner
        .args
        .push(planner.req_str("capsule_id")?.to_string());
    planner.push_root("--root")?;
    Ok(())
}

fn plan_fork(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner
        .args
        .push(planner.req_str("capsule_id")?.to_string());
    let branches = planner
        .object
        .get("branches")
        .and_then(Value::as_array)
        .ok_or_else(|| planner.invalid("'branches' must be a non-empty array"))?;
    if branches.is_empty() {
        return Err(planner.invalid("'branches' must be a non-empty array"));
    }
    for branch in branches {
        let branch_obj = branch
            .as_object()
            .ok_or_else(|| planner.invalid("each branch must be an object"))?;
        let label = branch_obj
            .get("label")
            .and_then(Value::as_str)
            .ok_or_else(|| planner.invalid("missing required string 'label'"))?;
        let hypothesis = branch_obj
            .get("hypothesis")
            .and_then(Value::as_str)
            .ok_or_else(|| planner.invalid("missing required string 'hypothesis'"))?;
        if label.contains('=') {
            return Err(planner.invalid("branch labels cannot contain '='"));
        }
        planner.push_flag("--branch", &format!("{label}={hypothesis}"));
    }
    planner.push_root("--root")?;
    Ok(())
}

fn plan_run(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner
        .args
        .push(planner.req_str("capsule_id")?.to_string());
    planner.push_flag("--command", planner.req_str("command")?);
    planner.push_root("--root")?;
    if planner.opt_bool("allow_failure")?.unwrap_or(false) {
        planner.args.push("--allow-failure".to_string());
    }
    planner.push_flag("--format", "json");
    Ok(())
}

fn plan_inspect(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args.push(planner.req_str("path")?.to_string());
    planner.push_flag("--format", "json");
    Ok(())
}

fn plan_diff(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args.push(planner.req_str("a")?.to_string());
    planner.args.push(planner.req_str("b")?.to_string());
    planner.push_root("--root")?;
    if let Some(store) = planner.opt_str("store")? {
        planner.push_flag("--store", store);
    }
    planner.push_flag("--format", "json");
    Ok(())
}

fn plan_lineage(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    let snapshot = planner.opt_str("snapshot")?;
    let root_snapshot = planner.opt_str("root_snapshot")?;
    if snapshot.is_some() && root_snapshot.is_some() {
        return Err(planner.invalid("'snapshot' and 'root_snapshot' are mutually exclusive"));
    }
    if let Some(value) = snapshot {
        planner.push_flag("--snapshot", value);
    }
    if let Some(value) = root_snapshot {
        planner.push_flag("--root", value);
    }
    planner.push_root("--root-dir")?;
    planner.push_flag("--format", "json");
    planner.args.push("--full-id".to_string());
    Ok(())
}

fn plan_replay(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    let snapshot = planner.opt_str("snapshot")?;
    let branch_id = planner.opt_str("branch_id")?;
    if snapshot.is_some() && branch_id.is_some() {
        return Err(planner.invalid("'snapshot' and 'branch_id' are mutually exclusive"));
    }
    planner.push_root("--root")?;
    if let Some(value) = snapshot {
        planner.push_flag("--snapshot", value);
    }
    if let Some(value) = branch_id {
        planner.push_flag("--branch-id", value);
    }
    planner.push_flag("--format", "json");
    Ok(())
}

fn plan_merge(planner: &mut CommandPlanner) -> Result<(), ProtocolError> {
    planner.args.push(planner.req_str("manifest")?.to_string());
    planner.push_flag("--format", "json");
    Ok(())
}
