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
    use super::{parse_therapy, unavailable};

    #[test]
    fn parses_catalog_identifiers_and_parameterized_json() {
        assert_eq!(
            parse_therapy("ChelationTherapy").unwrap(),
            serde_json::json!("ChelationTherapy")
        );
        assert_eq!(
            parse_therapy(r#"{"Corticosteroids":0.5}"#).unwrap(),
            serde_json::json!({"Corticosteroids":0.5})
        );
        assert_eq!(
            parse_therapy(r#"{"AntisepticPurge":{"target_signature":"p"}}"#).unwrap(),
            serde_json::json!({"AntisepticPurge":{"target_signature":"p"}})
        );
        assert!(parse_therapy("UnknownTherapy").is_err());
        assert!(parse_therapy(r#"{"TelomeraseActivation":{"extended_ticks":-1}}"#).is_err());
    }

    #[test]
    fn it_does_not_claim_an_unexecuted_treatment_succeeded() {
        let result = unavailable("agent-1", "ChelationTherapy");
        assert_eq!(result["success"], false);
        assert_eq!(result["status"], "not_executed");
        assert_eq!(result["treatment_administered"], false);
    }
}

pub(super) fn execute(
    target: (&str, &str),
    paths: (Option<String>, Option<String>),
) -> Result<serde_json::Value, String> {
    let (Some(journal), Some(authorization_file)) = paths else {
        return Ok(unavailable(target.0, target.1));
    };
    let (store, auth) = load_authorization((&journal, &authorization_file))?;
    validate_target(&auth, target)?;
    let mut ecosystem = genos_orchestrator::GenosEcosystem::new("authorized-clinical");
    ecosystem.restore_population(&store)?;
    let receipt = ecosystem.apply_authorized_therapy(&auth, &store)?;
    let administered = receipt["treatment_administered"] == true;
    Ok(
        serde_json::json!({ "success": administered, "treatment_administered": administered,
        "status": receipt["status"], "receipt": receipt }),
    )
}

fn load_authorization(
    paths: (&str, &str),
) -> Result<
    (
        genos_store::BiologicalReceiptStore,
        genos_orchestrator::authorized_therapy::TherapyAuthorization,
    ),
    String,
> {
    let journal = confined_file(paths.0)?;
    let authorization_file = confined_file(paths.1)?;
    let data = std::fs::read(authorization_file).map_err(|e| e.to_string())?;
    let auth = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    Ok((genos_store::BiologicalReceiptStore::open(journal), auth))
}

fn validate_target(
    auth: &genos_orchestrator::authorized_therapy::TherapyAuthorization,
    target: (&str, &str),
) -> Result<(), String> {
    let therapy: serde_json::Value =
        serde_json::from_str(&auth.therapy_json).map_err(|e| e.to_string())?;
    if auth.cell_id.to_string() != target.0 || therapy != parse_therapy(target.1)? {
        return Err("therapy target or type differs from authorization".into());
    }
    Ok(())
}

fn parse_therapy(input: &str) -> Result<serde_json::Value, String> {
    let value = serde_json::from_str(input).unwrap_or_else(|_| serde_json::json!(input));
    let typed: genos_biology::therapy::SystemicTherapy =
        serde_json::from_value(value).map_err(|error| format!("invalid therapy: {error}"))?;
    serde_json::to_value(typed).map_err(|error| error.to_string())
}

fn confined_file(value: &str) -> Result<std::path::PathBuf, String> {
    let root = std::env::var_os("GENOS_WORKSPACE_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or(std::env::current_dir().map_err(|e| e.to_string())?)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let path = std::path::PathBuf::from(value)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.starts_with(root) {
        return Err("clinical file is outside the workspace".into());
    }
    Ok(path)
}
