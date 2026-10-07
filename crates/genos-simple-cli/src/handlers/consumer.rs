use std::time::Duration;

pub struct Inspection<'a> {
    pub run_id: &'a str,
    pub organization_id: &'a str,
    pub project_id: &'a str,
}

fn inspect(spec: &Inspection) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let mut url = reqwest::Url::parse(&crate::api_base_url())?;
    url.set_path("/api/product-proofs/consumer-runs/");
    url.path_segments_mut().map_err(|_| "Invalid API URL")?.pop_if_empty().push(spec.run_id);
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()?;
    let request = client.get(url)
        .header("X-Organization-Id", spec.organization_id)
        .header("X-Project-Id", spec.project_id);
    let response = authenticate(request).send()?.error_for_status()?;
    Ok(response.json()?)
}

fn authenticate(request: reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder {
    match std::env::var("GENOS_API_KEY").or_else(|_| std::env::var("GENOS_API_TOKEN")) {
        Ok(token) if !token.trim().is_empty() => request.bearer_auth(token),
        _ => request,
    }
}

pub fn run(spec: &Inspection) {
    match inspect(spec) {
        Ok(value) => println!("{}", serde_json::to_string_pretty(&value).unwrap_or_default()),
        Err(error) => crate::command_error(error),
    }
}
