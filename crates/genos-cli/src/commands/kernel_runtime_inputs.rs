use serde_json::Value;

pub(super) fn parse_completion_contract(input: Option<&str>) -> Result<Option<Value>, String> {
    let Some(input) = input else { return Ok(None) };
    let contract: Value = serde_json::from_str(input)
        .map_err(|error| format!("invalid completion contract JSON: {error}"))?;
    validate_completion_contract(&contract)?;
    Ok(Some(contract))
}

fn validate_completion_contract(contract: &Value) -> Result<(), String> {
    let invariants = contract.get("invariants").and_then(Value::as_array)
        .filter(|items| !items.is_empty())
        .ok_or_else(|| String::from("completion contract requires a non-empty invariants array"))?;
    invariants.iter().try_for_each(validate_invariant)?;
    validate_required_evidence(contract.get("requiredEvidence"))
}

fn validate_invariant(invariant: &Value) -> Result<(), String> {
    let kind = invariant.get("kind").and_then(Value::as_str);
    let verifier_type = invariant.pointer("/verifier/type").and_then(Value::as_str);
    let label = invariant.get("label").and_then(Value::as_str);
    let supported_kind = matches!(kind, Some("functional" | "structural" | "epistemic" | "safety"));
    let supported_verifier = matches!(verifier_type, Some(
        "context.flag" | "context.flag_false" | "context.path_equals" | "context.list_empty"
        | "evidence.present" | "mission.outcome_success" | "mission.functional_check"
        | "rust.cell_division_completed"
    ));
    let valid_label = invariant.get("label").is_none() || label.is_some_and(|value| !value.is_empty());
    if !(supported_kind && supported_verifier && valid_label) {
        return Err(String::from("each completion invariant needs a supported kind and verifier.type"));
    }
    Ok(())
}

fn validate_required_evidence(required: Option<&Value>) -> Result<(), String> {
    let Some(required) = required else { return Ok(()) };
    let list = required.as_array()
        .ok_or_else(|| String::from("completion contract requiredEvidence must be an array"))?;
    if list.iter().any(|item| item.as_str().is_none_or(str::is_empty)) {
        return Err(String::from("completion contract requiredEvidence must contain non-empty strings"));
    }
    Ok(())
}

pub(super) const MIN_TIMEOUT_MS: u64 = 1_000;
pub(super) const MAX_TIMEOUT_MS: u64 = 180_000;
pub(super) const MISSION_TOKEN_BUDGET: u64 = 120_000;
pub(super) const VERIFICATION_TIMEOUT_MS: u64 = 30_000;
pub(super) const DIAGNOSTIC_HYPOTHESES: [&str; 2] = [
    "A mission cannot be called passed unless its terminal status and evidence are bound to its mission ID.",
    "When worker evidence cannot substantiate an outcome, the mission must remain unresolved rather than succeed.",
];

pub(super) fn parse_success_criteria(input: Option<&str>) -> Result<Option<Value>, String> {
    let Some(input) = input else { return Ok(None) };
    let criteria: Value = serde_json::from_str(input)
        .map_err(|error| format!("invalid success criteria JSON: {error}"))?;
    let items = criteria.as_array()
        .filter(|items| !items.is_empty())
        .ok_or_else(|| String::from("success criteria must be a non-empty JSON array"))?;
    if items.iter().any(|item| item.as_str().is_none_or(|text| text.trim().is_empty())) {
        return Err(String::from("success criteria must contain only non-empty strings"));
    }
    Ok(Some(criteria))
}

pub(super) fn parse_native_objectives(input: Option<&str>) -> Result<Option<Value>, String> {
    let Some(input) = input else { return Ok(None) };
    let objectives: Value = serde_json::from_str(input)
        .map_err(|error| format!("invalid native objectives JSON: {error}"))?;
    let items = objectives.as_array()
        .filter(|items| !items.is_empty() && items.len() <= 20)
        .ok_or_else(|| String::from("native objectives must be a JSON array containing 1 to 20 items"))?;
    items.iter().try_for_each(validate_native_objective)?;
    Ok(Some(objectives))
}

fn validate_native_objective(objective: &Value) -> Result<(), String> {
    let goal = objective.get("goal").and_then(Value::as_str);
    let criteria = objective.get("successCriteria").and_then(Value::as_array);
    let method = objective.get("methodContract");
    let method_id = method.and_then(|value| value.get("methodId")).and_then(Value::as_str);
    let version = method.and_then(|value| value.get("version")).and_then(Value::as_u64);
    let criteria_valid = criteria.is_some_and(|items| {
        !items.is_empty() && items.iter().all(|item| {
            item.as_str().is_some_and(|text| !text.trim().is_empty())
        })
    });
    if !goal.is_some_and(|text| !text.trim().is_empty())
        || !criteria_valid
        || version != Some(1)
        || !method_id.is_some_and(|text| !text.trim().is_empty())
    {
        return Err(String::from(
            "each native objective requires a non-empty goal, successCriteria, and version 1 methodContract.methodId",
        ));
    }
    Ok(())
}

pub(super) fn validate_timeout_ms(timeout_ms: u64) -> Result<(), String> {
    if !(MIN_TIMEOUT_MS..=MAX_TIMEOUT_MS).contains(&timeout_ms) {
        return Err(format!("timeout-ms must be between {MIN_TIMEOUT_MS} and {MAX_TIMEOUT_MS}"));
    }
    Ok(())
}

pub(super) fn validate_executor(executor: &str) -> Result<(), String> {
    if executor != "codex" {
        return Err(String::from(
            "executor must be 'codex'; the independent Rust verifier requires durable worker receipts",
        ));
    }
    Ok(())
}
