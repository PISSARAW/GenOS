use serde_json::json;
use uuid::Uuid;

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
    let authorization_path = confined_file(&authorization_file)?;
    let data = std::fs::read(authorization_path).map_err(|e| e.to_string())?;
    let auth: genos_orchestrator::authorized_therapy::TherapyAuthorization =
        serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    validate_target(&auth, target)?;
    let operation_id = format!("clinical-apply:{}", auth.authorization_id);
    let claimant_id = clinical_claimant_id()?;
    let journal_path = confined_file(&journal)?;
    let store = genos_store::BiologicalReceiptStore::open(journal_path);
    let previous = store.find_idempotent_receipt("genos.clinical-application/v1", &operation_id)?;
    let claim = claim_backend_authority(&auth, &operation_id, &claimant_id)?;
    if claim["status"] == "completed" && previous.is_none() {
        return Err("completed clinical operation is missing from the Rust journal; refusing to reapply".into());
    }
    let mut ecosystem = genos_orchestrator::GenosEcosystem::new("authorized-clinical");
    ecosystem.restore_population(&store)?;
    let receipt = ecosystem.apply_authorized_therapy(&auth, &store)?;
    complete_backend_application(&auth, &operation_id,
        claim["claimToken"].as_str().unwrap_or_default(), &receipt)?;
    let administered = receipt["treatment_administered"] == true;
    Ok(
        serde_json::json!({ "success": administered, "treatment_administered": administered,
        "status": receipt["status"], "receipt": receipt }),
    )
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

fn claim_backend_authority(
    auth: &genos_orchestrator::authorized_therapy::TherapyAuthorization,
    operation_id: &str,
    claimant_id: &str,
) -> Result<serde_json::Value, String> {
    let response = backend_authority_request(auth, "claim", json!({
        "missionId": auth.mission_id.to_string(), "cellId": auth.cell_id.to_string(),
        "signature": auth.signature.clone(), "operationId": operation_id, "claimantId": claimant_id,
    }))?.send()
        .map_err(|_| "clinical revocation state unavailable")?;
    if !response.status().is_success() {
        return Err(backend_rejection(response));
    }
    let result: serde_json::Value = response.json()
        .map_err(|_| "clinical backend returned invalid authorization state")?;
    if result["authorized"] != true
        || result["authorizationId"] != auth.authorization_id.to_string()
        || result["operationId"] != operation_id
        || result["claimToken"].as_str().is_none()
    {
        return Err("clinical backend did not confirm the durable application claim".into());
    }
    Ok(result)
}

fn complete_backend_application(
    auth: &genos_orchestrator::authorized_therapy::TherapyAuthorization,
    operation_id: &str,
    claim_token: &str,
    receipt: &serde_json::Value,
) -> Result<(), String> {
    let response = backend_authority_request(auth, "complete", json!({
        "operationId": operation_id, "claimToken": claim_token, "result": receipt,
    }))?.send().map_err(|_| "clinical application completion unavailable")?;
    if !response.status().is_success() {
        return Err(backend_rejection(response));
    }
    let result: serde_json::Value = response.json()
        .map_err(|_| "clinical backend returned invalid application completion")?;
    if result["status"] != "completed" || result["operationId"] != operation_id {
        return Err("clinical backend did not persist application completion".into());
    }
    Ok(())
}

fn backend_rejection(response: reqwest::blocking::Response) -> String {
    let status = response.status();
    let body = response.json::<serde_json::Value>().unwrap_or_default();
    match body["error"]["code"].as_str() {
        Some("CLINICAL_AUTHORIZATION_REVOKED") => "clinical authorization rejected by backend revocation state".into(),
        Some("CLINICAL_APPLICATION_IN_PROGRESS") => "clinical application already has an active claimant".into(),
        Some("CLINICAL_APPLICATION_CLAIM_LOST") => "clinical application claim was superseded".into(),
        _ => format!("clinical backend rejected application claim ({status})"),
    }
}

fn backend_authority_request(
    auth: &genos_orchestrator::authorized_therapy::TherapyAuthorization,
    action: &str,
    body: serde_json::Value,
) -> Result<reqwest::blocking::RequestBuilder, String> {
    use std::time::Duration;
    let backend = required_environment("GENOS_CLINICAL_BACKEND_URL")?;
    let backend = validate_backend_url(&backend)?;
    let token = required_environment("GENOS_CLINICAL_AUTH_TOKEN")?;
    let organization = required_environment("GENOS_CLINICAL_ORGANIZATION_ID")?;
    let project = required_environment("GENOS_CLINICAL_PROJECT_ID")?;
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|_| "clinical revocation state unavailable")?;
    let url = format!("{}/api/rust/clinical-authorizations/{}/{}",
        backend.as_str().trim_end_matches('/'), auth.authorization_id, action);
    Ok(client.post(url).bearer_auth(token)
        .header("x-organization-id", organization)
        .header("x-project-id", project).json(&body))
}

fn clinical_claimant_id() -> Result<String, String> {
    match std::env::var("GENOS_CLINICAL_CLAIMANT_ID") {
        Ok(value) => Uuid::parse_str(&value).map(|id| id.to_string())
            .map_err(|_| "GENOS_CLINICAL_CLAIMANT_ID must be a UUID".into()),
        Err(_) => Ok(Uuid::new_v4().to_string()),
    }
}

fn validate_backend_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value.trim())
        .map_err(|_| "clinical backend URL invalid")?;
    if has_disallowed_url_components(&url) {
        return Err("clinical backend URL must not contain credentials, query, or fragment".into());
    }
    if !allows_backend_transport(&url) {
        return Err("clinical backend URL requires HTTPS outside test/development loopback".into());
    }
    Ok(url)
}

fn has_disallowed_url_components(url: &reqwest::Url) -> bool {
    url.username() != "" || url.password().is_some() || url.fragment().is_some()
        || url.query().is_some()
}

fn allows_backend_transport(url: &reqwest::Url) -> bool {
    if url.scheme() == "https" { return true; }
    url.scheme() == "http" && is_loopback_host(url.host_str().unwrap_or_default())
        && matches!(std::env::var("NODE_ENV").as_deref(), Ok("test" | "development"))
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host.parse::<std::net::IpAddr>().is_ok_and(|address| address.is_loopback())
}

fn required_environment(name: &str) -> Result<String, String> {
    std::env::var(name).ok().filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("{name} required; offline clinical authorization is refused"))
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
