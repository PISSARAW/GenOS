use serde_json::json;

pub(super) fn unavailable(agent_id: &str, therapy_type: &str) -> serde_json::Value {
    json!({
        "success": false,
        "operation": "therapy",
        "agent_id": agent_id,
        "therapy_type": therapy_type,
        "status": "not_executed",
        "treatment_administered": false,
        "reason": "persistent clinical state and a wired therapy executor are required"
    })
}

#[cfg(test)]
mod tests {
    use super::unavailable;

    #[test]
    fn it_does_not_claim_an_unexecuted_treatment_succeeded() {
        let result = unavailable("agent-1", "ChelationTherapy");
        assert_eq!(result["success"], false);
        assert_eq!(result["status"], "not_executed");
        assert_eq!(result["treatment_administered"], false);
    }
}


pub(super) fn execute(target: (&str, &str), paths: (Option<String>, Option<String>)) -> Result<serde_json::Value, String> {
    let (Some(journal), Some(authorization_file)) = paths else { return Ok(unavailable(target.0, target.1)); };
    let journal = confined_file(&journal)?;
    let authorization_file = confined_file(&authorization_file)?;
    let auth: genos_orchestrator::authorized_therapy::TherapyAuthorization = serde_json::from_slice(
        &std::fs::read(authorization_file).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let therapy: serde_json::Value = serde_json::from_str(&auth.therapy_json).map_err(|e| e.to_string())?;
    if auth.cell_id.to_string() != target.0 || therapy != serde_json::json!(target.1) {
        return Err("therapy target or type differs from authorization".into());
    }
    let store = genos_store::BiologicalReceiptStore::open(journal);
    let mut ecosystem = genos_orchestrator::GenosEcosystem::new("authorized-clinical");
    ecosystem.restore_population(&store)?;
    let receipt = ecosystem.apply_authorized_therapy(&auth, &store)?;
    Ok(serde_json::json!({ "success": true, "treatment_administered": true, "receipt": receipt }))
}

fn confined_file(value: &str) -> Result<std::path::PathBuf, String> {
    let root = std::env::var_os("GENOS_WORKSPACE_ROOT").map(std::path::PathBuf::from)
        .unwrap_or(std::env::current_dir().map_err(|e| e.to_string())?).canonicalize().map_err(|e| e.to_string())?;
    let path = std::path::PathBuf::from(value).canonicalize().map_err(|e| e.to_string())?;
    if !path.starts_with(root) { return Err("clinical file is outside the workspace".into()); }
    Ok(path)
}
