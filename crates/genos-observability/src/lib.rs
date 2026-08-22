use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use uuid::Uuid;

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

pub fn stable_attribute_hash(value: &Value) -> String {
    let mut h = Sha256::new();
    h.update(serde_json::to_vec(value).unwrap_or_default());
    format!("{:x}", h.finalize())
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
}
