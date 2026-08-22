use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub mod search;
pub use search::*;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TraceContext {
    pub trace_id: String,
    pub span_id: String,
    #[serde(default)]
    pub trace_flags: String,
    #[serde(default)]
    pub trace_state: Option<String>,
}

impl TraceContext {
    pub fn root() -> Self {
        Self {
            trace_id: Uuid::new_v4().simple().to_string(),
            span_id: Uuid::new_v4().simple().to_string()[..16].to_string(),
            trace_flags: "01".into(),
            trace_state: None,
        }
    }

    pub fn child(&self) -> Self {
        Self {
            trace_id: self.trace_id.clone(),
            span_id: Uuid::new_v4().simple().to_string()[..16].to_string(),
            trace_flags: self.trace_flags.clone(),
            trace_state: self.trace_state.clone(),
        }
    }

    pub fn inject(&self) -> String {
        format!("00-{}-{}-{}", self.trace_id, self.span_id, self.trace_flags)
    }

    pub fn extract(value: &str) -> Option<Self> {
        let mut parts = value.split('-');
        if parts.next()? != "00" {
            return None;
        }
        let trace_id = parts.next()?.to_string();
        let span_id = parts.next()?.to_string();
        let trace_flags = parts.next()?.to_string();
        if trace_id.len() != 32
            || span_id.len() != 16
            || trace_flags.len() != 2
            || trace_id.chars().all(|c| c == '0')
            || span_id.chars().all(|c| c == '0')
        {
            return None;
        }
        Some(Self {
            trace_id,
            span_id,
            trace_flags,
            trace_state: None,
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Span {
    pub trace_id: String,
    pub span_id: String,
    pub parent_span_id: Option<String>,
    pub name: String,
    pub start_unix_nano: u64,
    pub end_unix_nano: u64,
    #[serde(default)]
    pub attributes: BTreeMap<String, Value>,
    pub status: String,
}

#[derive(Clone, Default)]
pub struct SpanCollector {
    spans: Arc<Mutex<Vec<Span>>>,
}

impl SpanCollector {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn record(
        &self,
        context: &TraceContext,
        name: impl Into<String>,
        attributes: BTreeMap<String, Value>,
        duration_ms: u64,
        status: impl Into<String>,
    ) {
        let end = now_nanos();
        let start = end.saturating_sub(duration_ms.saturating_mul(1_000_000));
        self.spans
            .lock()
            .expect("span collector mutex poisoned")
            .push(Span {
                trace_id: context.trace_id.clone(),
                span_id: context.span_id.clone(),
                parent_span_id: None,
                name: name.into(),
                start_unix_nano: start,
                end_unix_nano: end,
                attributes,
                status: status.into(),
            });
    }
    pub fn snapshot(&self) -> Vec<Span> {
        self.spans
            .lock()
            .expect("span collector mutex poisoned")
            .clone()
    }
}

fn now_nanos() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or_default()
}

#[derive(Clone, Debug, Default)]
pub struct Redactor {
    secrets: Vec<String>,
}

impl Redactor {
    pub fn new(secrets: impl IntoIterator<Item = String>) -> Self {
        Self {
            secrets: secrets.into_iter().filter(|s| !s.is_empty()).collect(),
        }
    }
    pub fn redact(&self, mut value: Value) -> Value {
        fn walk(value: &mut Value, secrets: &[String]) {
            match value {
                Value::String(s) => {
                    for secret in secrets {
                        *s = s.replace(secret, "[REDACTED]");
                    }
                }
                Value::Array(items) => {
                    for item in items {
                        walk(item, secrets);
                    }
                }
                Value::Object(items) => {
                    for item in items.values_mut() {
                        walk(item, secrets);
                    }
                }
                _ => {}
            }
        }
        walk(&mut value, &self.secrets);
        value
    }
}

#[derive(Clone, Debug)]
pub struct OtlpHttpExporter {
    endpoint: String,
    client: reqwest::Client,
    redactor: Redactor,
}

impl OtlpHttpExporter {
    pub fn new(endpoint: impl Into<String>, redactor: Redactor) -> Self {
        Self {
            endpoint: endpoint.into(),
            client: reqwest::Client::new(),
            redactor,
        }
    }

    /// Builds an exporter from a named observability backend. The caller owns
    /// credentials; they are attached to the HTTP client rather than recorded
    /// in spans or audit bundles.
    pub fn for_provider(
        provider: ObservabilityProvider,
        endpoint: impl Into<String>,
        api_key: Option<&str>,
        redactor: Redactor,
    ) -> anyhow::Result<Self> {
        let endpoint = endpoint.into();
        let mut headers = reqwest::header::HeaderMap::new();
        if let Some(key) = api_key.filter(|key| !key.is_empty()) {
            let header = provider.credential_header();
            headers.insert(
                header,
                reqwest::header::HeaderValue::from_str(key)
                    .context("invalid observability provider credential")?,
            );
        }
        Ok(Self {
            endpoint: provider.otlp_endpoint(&endpoint),
            client: reqwest::Client::builder().default_headers(headers).build()?,
            redactor,
        })
    }
    pub async fn export(&self, spans: &[Span]) -> anyhow::Result<()> {
        let encoded = spans
            .iter()
            .map(|span| {
                let attributes = span
                    .attributes
                    .iter()
                    .map(|(key, value)| {
                        json!({ "key": key, "value": { "stringValue": value.to_string() } })
                    })
                    .collect::<Vec<_>>();
                json!({
                    "traceId": span.trace_id,
                    "spanId": span.span_id,
                    "parentSpanId": span.parent_span_id,
                    "name": span.name,
                    "startTimeUnixNano": span.start_unix_nano.to_string(),
                    "endTimeUnixNano": span.end_unix_nano.to_string(),
                    "attributes": attributes,
                    "status": { "code": span.status }
                })
            })
            .collect::<Vec<_>>();
        let payload = self
            .redactor
            .redact(json!({ "resourceSpans": [{ "scopeSpans": [{ "spans": encoded }] }] }));
        self.client
            .post(&self.endpoint)
            .json(&payload)
            .send()
            .await?
            .error_for_status()
            .context("OTLP exporter rejected spans")?;
        Ok(())
    }
}

/// Well-known OTLP-compatible providers. `endpoint` is the provider base URL,
/// allowing self-hosted Jaeger, Tempo and Phoenix deployments as well as a
/// Datadog OTLP gateway.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObservabilityProvider {
    Jaeger,
    GrafanaTempo,
    Datadog,
    Phoenix,
}

impl ObservabilityProvider {
    pub fn otlp_endpoint(self, base_url: &str) -> String {
        format!("{}/v1/traces", base_url.trim_end_matches('/'))
    }

    pub fn credential_header(self) -> reqwest::header::HeaderName {
        match self {
            Self::Datadog => reqwest::header::HeaderName::from_static("dd-api-key"),
            Self::Jaeger | Self::GrafanaTempo | Self::Phoenix => {
                reqwest::header::HeaderName::from_static("authorization")
            }
        }
    }
}

pub fn stable_attribute_hash(value: &Value) -> String {
    let mut h = Sha256::new();
    h.update(serde_json::to_vec(value).unwrap_or_default());
    format!("{:x}", h.finalize())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuditBundle {
    pub version: u32,
    pub run_id: String,
    pub manifest: Value,
    pub spans: Vec<Span>,
    #[serde(default)]
    pub events: Vec<Value>,
    pub digest: String,
}

impl AuditBundle {
    pub fn new(run_id: impl Into<String>, manifest: Value, spans: Vec<Span>, events: Vec<Value>) -> Self {
        let run_id = run_id.into();
        let payload = serde_json::to_vec(&(run_id.clone(), &manifest, &spans, &events)).unwrap_or_default();
        Self { version: 1, run_id, manifest, spans, events, digest: digest_bytes(&payload) }
    }
    pub fn verify(&self) -> bool {
        let payload = serde_json::to_vec(&(&self.run_id, &self.manifest, &self.spans, &self.events)).unwrap_or_default();
        self.digest == digest_bytes(&payload)
    }
    pub fn save(&self, path: impl AsRef<std::path::Path>) -> anyhow::Result<()> {
        std::fs::write(path, serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }
    pub fn load(path: impl AsRef<std::path::Path>) -> anyhow::Result<Self> {
        let bundle: Self = serde_json::from_slice(&std::fs::read(path)?)?;
        anyhow::ensure!(bundle.verify(), "audit bundle digest mismatch");
        Ok(bundle)
    }
}

fn digest_bytes(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("sha256:{:x}", h.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn w3c_round_trip() {
        let root = TraceContext::root();
        assert_eq!(
            TraceContext::extract(&root.inject()).unwrap().trace_id,
            root.trace_id
        );
        assert_eq!(root.child().trace_id, root.trace_id);
    }
    #[test]
    fn redacts_nested_values() {
        let r = Redactor::new(["token".into()]);
        assert_eq!(r.redact(json!({"x":"my-token"}))["x"], "my-[REDACTED]");
    }
    #[test]
    fn audit_bundle_detects_tampering() {
        let mut bundle = AuditBundle::new("run-1", json!({"workflow":"demo"}), vec![], vec![]);
        assert!(bundle.verify());
        bundle.events.push(json!({"type":"changed"}));
        assert!(!bundle.verify());
    }

    #[test]
    fn provider_profiles_preserve_otlp_path_and_credential_shape() {
        assert_eq!(
            ObservabilityProvider::Jaeger.otlp_endpoint("http://jaeger:4318/"),
            "http://jaeger:4318/v1/traces"
        );
        assert_eq!(
            ObservabilityProvider::Datadog.credential_header(),
            reqwest::header::HeaderName::from_static("dd-api-key")
        );
        assert_eq!(
            ObservabilityProvider::Phoenix.credential_header(),
            reqwest::header::HeaderName::from_static("authorization")
        );
    }
}
