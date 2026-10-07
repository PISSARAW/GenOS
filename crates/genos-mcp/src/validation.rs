use serde_json::{Value};
use std::path::{Path, PathBuf};

pub const PATH_ARGUMENTS: &[&str] = &[
    "agent", "out", "output", "history_file", "input_file", "manifest",
    "graph_file", "snapshot", "snapshot_id", "branch_id", "parent_id",
];

pub fn validate_path_arguments(args: &Value, workspace: &Path) -> Result<(), String> {
    if args.is_null() {
        return Ok(());
    }
    let object = extract_object(args)?;
    for key in PATH_ARGUMENTS {
        validate_single_path(key, object, workspace)?;
    }
    Ok(())
}

fn extract_object(args: &Value) -> Result<&serde_json::Map<String, Value>, String> {
    match args {
        Value::Object(map) => Ok(map),
        _ => Err("Tool arguments must be a JSON object.".into()),
    }
}

fn validate_single_path(key: &str, object: &serde_json::Map<String, Value>, workspace: &Path) -> Result<(), String> {
    let Some(value) = object.get(key).and_then(Value::as_str) else { return Ok(()); };
    check_path_safety(key, value)?;
    check_path_within_workspace(key, value, workspace)
}

fn check_path_safety(key: &str, value: &str) -> Result<(), String> {
    let has_parent_segment = value.split(['/', '\\']).any(|segment| segment == "..");
    let is_absolute = value.starts_with('/')
        || value.starts_with('\\')
        || value.as_bytes().get(1) == Some(&b':');
    if value.is_empty() || value.contains('\0') || is_absolute || has_parent_segment {
        return Err(format!("{key} must be a safe workspace-relative path."));
    }
    Ok(())
}

fn check_path_within_workspace(key: &str, value: &str, workspace: &Path) -> Result<(), String> {
    let path = std::path::Path::new(value);
    let root = workspace
        .canonicalize()
        .map_err(|_| format!("{key} must remain inside the GenOS workspace."))?;
    let mut probe = root.join(path);
    while !probe.exists() {
        if !probe.pop() {
            return Err(format!("{key} must remain inside the GenOS workspace."));
        }
    }
    let resolved = probe
        .canonicalize()
        .map_err(|_| format!("{key} must remain inside the GenOS workspace."))?;
    if !resolved.starts_with(&root) {
        return Err(format!("{key} must remain inside the GenOS workspace and avoid symlinks."));
    }
    Ok(())
}

fn required_string(object: &serde_json::Map<String, serde_json::Value>, field: &str) -> Result<(), String> {
    match object.get(field).and_then(serde_json::Value::as_str).filter(|value| !value.trim().is_empty()) {
        Some(_) => Ok(()),
        None => Err(format!("{field} must be a non-empty string.")),
    }
}

pub fn validate_tool_arguments(name: &str, args: &serde_json::Value) -> Result<(), String> {
    let object = match args {
        serde_json::Value::Object(map) => map,
        _ => return Err("Tool arguments must be a JSON object.".into()),
    };
    let required = get_required_fields(name);
    for field in required {
        required_string(object, field)?;
    }
    apply_special_validations(name, object)
}

fn get_required_fields(name: &str) -> &[&str] {
    match name {
        "genos_orchestrate" | "genos_delegate_worker" => &["mission"],
        "genos_snapshot" => &["agent", "out"],
        "genos_capsule_create" => &["snapshot_id"],
        "genos_change_strategy" => &["strategy", "reason"],
        "genos_report_progress" => &["phase", "message"],
        "genos_change_organization" => &["organization", "reason"],
        "genos_worker_publish" => &["kind", "signal_type", "signal_data"],
        "genos_trinity_launch" => &["mission"],
        "genos_a_team_preview" => &["project_goal", "sub_systems"],
        "genos_merge" => &["branch_id"],
        "genos_audit" => &["snapshot_id"],
        "genos_biomimicry" => &["feature", "action"],
        "genos_biological_mode" => &["mode", "mission"],
        "genos_execute_primitive" => &["primitive_name"],
        "genos_philosophy" => &["operation"],
        _ => &[],
    }
}

fn apply_special_validations(name: &str, object: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    validate_execution_tool_arguments(name, object)?;
    if name == "genos_philosophy" {
        validate_philosophy_arguments(object)?;
    }
    Ok(())
}

fn validate_execution_tool_arguments(name: &str, object: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    if name == "genos_replay" {
        validate_genos_replay(object)?;
    }
    if name == "genos_a_team_preview" && !object.get("sub_systems").is_some_and(serde_json::Value::is_array) {
        return Err("sub_systems must be an array.".into());
    }
    Ok(())
}

fn validate_genos_replay(object: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let has_snapshot = object.get("snapshot").and_then(serde_json::Value::as_str).is_some_and(|value| !value.trim().is_empty());
    let has_snapshot_id = object.get("snapshot_id").and_then(serde_json::Value::as_str).is_some_and(|value| !value.trim().is_empty());
    if !has_snapshot && !has_snapshot_id {
        return Err("snapshot or snapshot_id must be provided.".into());
    }
    Ok(())
}

fn validate_philosophy_arguments(object: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let operation = object
        .get("operation")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "operation must be a non-empty string.".to_string())?;
    if object.get("arguments").is_some_and(|value| !value.is_object()) {
        return Err("arguments must be an object.".into());
    }
    let applies_runtime_effect = object
        .get("arguments")
        .and_then(serde_json::Value::as_object)
        .and_then(|args| args.get("apply"))
        .and_then(serde_json::Value::as_bool)
        == Some(true);
    match (operation, applies_runtime_effect) {
        ("saveAnalysis", _) | ("applyRuntimeEffect", true) => {
            Err("genos_philosophy is read-only; runtime effects are preview-only.".into())
        }
        _ => Ok(()),
    }
}
