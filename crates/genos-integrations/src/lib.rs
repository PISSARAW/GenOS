use anyhow::Result;
use reqwest::{Client, Method, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

#[derive(Clone, Debug)]
pub enum Auth {
    None,
    Bearer(String),
    ApiKey { header: String, value: String },
}

#[derive(Clone)]
pub struct ApiClient {
    client: Client,
    base_url: String,
    auth: Auth,
    rate_limiter: Arc<Mutex<RateLimiter>>,
}

#[derive(Debug)]
struct RateLimiter {
    next_request: Instant,
    interval: Duration,
}

impl ApiClient {
    pub fn new(base_url: impl Into<String>, auth: Auth, requests_per_second: u32) -> Self {
        let interval = Duration::from_secs_f64(1.0 / requests_per_second.max(1) as f64);
        Self {
            client: Client::new(),
            base_url: base_url.into().trim_end_matches('/').into(),
            auth,
            rate_limiter: Arc::new(Mutex::new(RateLimiter {
                next_request: Instant::now(),
                interval,
            })),
        }
    }
    pub async fn request_json<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<&Value>,
    ) -> Result<T> {
        self.wait_rate_limit().await;
        let mut request = self.client.request(
            method,
            format!("{}/{}", self.base_url, path.trim_start_matches('/')),
        );
        request = match &self.auth {
            Auth::None => request,
            Auth::Bearer(token) => request.bearer_auth(token),
            Auth::ApiKey { header, value } => request.header(header, value),
        };
        if let Some(body) = body {
            request = request.json(body);
        }
        let response = request.send().await?;
        let status = response.status();
        let payload = response.text().await?;
        if !status.is_success() {
            anyhow::bail!("integration API returned {}: {}", status, payload);
        }
        Ok(serde_json::from_str(&payload)?)
    }
    async fn wait_rate_limit(&self) {
        let mut limiter = self.rate_limiter.lock().await;
        let now = Instant::now();
        if limiter.next_request > now {
            tokio::time::sleep(limiter.next_request - now).await;
        }
        limiter.next_request = Instant::now() + limiter.interval;
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    #[serde(default)]
    pub next_cursor: Option<String>,
    #[serde(default)]
    pub has_more: bool,
}

pub async fn fetch_all<T: DeserializeOwned>(
    client: &ApiClient,
    path: &str,
    limit: usize,
) -> Result<Vec<T>> {
    let mut cursor = None;
    let mut items = Vec::new();
    while items.len() < limit {
        let query = cursor.as_ref().map(|value| format!("?cursor={value}"));
        let page: Page<T> = client
            .request_json(
                Method::GET,
                &format!("{}{}", path, query.unwrap_or_default()),
                None,
            )
            .await?;
        let done = !page.has_more || page.next_cursor.is_none();
        items.extend(page.items);
        cursor = page.next_cursor;
        if done {
            break;
        }
    }
    items.truncate(limit);
    Ok(items)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub version: String,
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub config: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Default)]
pub struct PluginRegistry {
    plugins: BTreeMap<String, PluginManifest>,
}
impl PluginRegistry {
    pub fn register(&mut self, manifest: PluginManifest) -> Result<()> {
        if manifest.id.trim().is_empty() || manifest.version.trim().is_empty() {
            anyhow::bail!("plugin id and version are required");
        }
        if self.plugins.contains_key(&manifest.id) {
            anyhow::bail!("plugin already registered: {}", manifest.id);
        }
        self.plugins.insert(manifest.id.clone(), manifest);
        Ok(())
    }
    pub fn get(&self, id: &str) -> Option<&PluginManifest> {
        self.plugins.get(id)
    }
    pub fn list(&self) -> Vec<&PluginManifest> {
        self.plugins.values().collect()
    }
}

pub fn is_retryable(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registry_rejects_duplicate_plugins() {
        let mut registry = PluginRegistry::default();
        let manifest = PluginManifest {
            id: "github".into(),
            version: "1".into(),
            capabilities: vec!["issues".into()],
            config: BTreeMap::new(),
        };
        registry.register(manifest.clone()).unwrap();
        assert!(registry.register(manifest).is_err());
        assert_eq!(registry.list().len(), 1);
    }
}
