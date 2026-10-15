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
    let authorization_path = confined_file(&authorization_file)?;
    let data = std::fs::read(authorization_path).map_err(|e| e.to_string())?;
    let auth: genos_orchestrator::authorized_therapy::TherapyAuthorization =
        serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    validate_target(&auth, target)?;
    validate_backend_authority(&auth)?;
    let journal_path = confined_file(&journal)?;
    let store = genos_store::BiologicalReceiptStore::open(journal_path);
    let mut ecosystem = genos_orchestrator::GenosEcosystem::new("authorized-clinical");
    ecosystem.restore_population(&store)?;
    let receipt = ecosystem.apply_authorized_therapy(&auth, &store)?;
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

fn validate_backend_authority(
    auth: &genos_orchestrator::authorized_therapy::TherapyAuthorization,
) -> Result<(), String> {
    let response = backend_authority_request(auth)?.send()
        .map_err(|_| "clinical revocation state unavailable")?;
    if !response.status().is_success() {
        return Err("clinical authorization rejected by backend revocation state".into());
    }
    let result: serde_json::Value = response.json()
        .map_err(|_| "clinical backend returned invalid authorization state")?;
    if result["authorized"] != true
        || result["authorizationId"] != auth.authorization_id.to_string()
    {
        return Err("clinical backend did not confirm current authorization".into());
    }
    Ok(())
}

fn backend_authority_request(
    auth: &genos_orchestrator::authorized_therapy::TherapyAuthorization,
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
    let url = format!("{}/api/rust/clinical-authorizations/{}/validate",
        backend.as_str().trim_end_matches('/'), auth.authorization_id);
    Ok(client.post(url).bearer_auth(token)
        .header("x-organization-id", organization)
        .header("x-project-id", project)
        .json(&json!({ "missionId": auth.mission_id.to_string(),
            "cellId": auth.cell_id.to_string(), "signature": auth.signature })))
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
