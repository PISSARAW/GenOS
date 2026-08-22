use crate::{GenerationConfig, LlmProvider, LlmResponse, Message};
use anyhow::Result;
use async_trait::async_trait;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

fn request_key(messages: &[Message], config: &GenerationConfig) -> String {
    let mut hasher = Sha256::new();
    hasher.update(serde_json::to_vec(&(messages, config)).unwrap_or_default());
    format!("{:x}", hasher.finalize())
}

pub struct RetryingProvider {
    inner: Arc<dyn LlmProvider>,
    attempts: u32,
    delay: Duration,
}
impl RetryingProvider {
    pub fn new(inner: Arc<dyn LlmProvider>, attempts: u32, delay: Duration) -> Self {
        Self {
            inner,
            attempts: attempts.max(1),
            delay,
        }
    }
}
#[async_trait]
impl LlmProvider for RetryingProvider {
    fn provider_name(&self) -> &str {
        self.inner.provider_name()
    }
    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> Result<LlmResponse> {
        let mut last = None;
        for attempt in 0..self.attempts {
            match self.inner.generate(messages, config).await {
                Ok(response) => return Ok(response),
                Err(error) => {
                    last = Some(error);
                    if attempt + 1 < self.attempts {
                        tokio::time::sleep(self.delay).await;
                    }
                }
            }
        }
        Err(last.expect("retry loop always executes"))
    }
}

pub struct CachedProvider {
    inner: Arc<dyn LlmProvider>,
    entries: Mutex<HashMap<String, LlmResponse>>,
}
impl CachedProvider {
    pub fn new(inner: Arc<dyn LlmProvider>) -> Self {
        Self {
            inner,
            entries: Mutex::new(HashMap::new()),
        }
    }
}
#[async_trait]
impl LlmProvider for CachedProvider {
    fn provider_name(&self) -> &str {
        self.inner.provider_name()
    }
    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> Result<LlmResponse> {
        let key = request_key(messages, config);
        if let Some(response) = self.entries.lock().await.get(&key).cloned() {
            return Ok(response);
        }
        let response = self.inner.generate(messages, config).await?;
        self.entries.lock().await.insert(key, response.clone());
        Ok(response)
    }
}

struct BreakerState {
    failures: u32,
    opened_until: Option<Instant>,
}
pub struct CircuitBreakerProvider {
    inner: Arc<dyn LlmProvider>,
    threshold: u32,
    cooldown: Duration,
    state: Mutex<BreakerState>,
}
impl CircuitBreakerProvider {
    pub fn new(inner: Arc<dyn LlmProvider>, threshold: u32, cooldown: Duration) -> Self {
        Self {
            inner,
            threshold: threshold.max(1),
            cooldown,
            state: Mutex::new(BreakerState {
                failures: 0,
                opened_until: None,
            }),
        }
    }
}
#[async_trait]
impl LlmProvider for CircuitBreakerProvider {
    fn provider_name(&self) -> &str {
        self.inner.provider_name()
    }
    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> Result<LlmResponse> {
        {
            let state = self.state.lock().await;
            if state
                .opened_until
                .is_some_and(|until| until > Instant::now())
            {
                anyhow::bail!("provider circuit is open");
            }
        }
        match self.inner.generate(messages, config).await {
            Ok(response) => {
                let mut state = self.state.lock().await;
                state.failures = 0;
                state.opened_until = None;
                Ok(response)
            }
            Err(error) => {
                let mut state = self.state.lock().await;
                state.failures += 1;
                if state.failures >= self.threshold {
                    state.opened_until = Some(Instant::now() + self.cooldown);
                }
                Err(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{fake::FakeModel, Role};
    #[tokio::test]
    async fn cache_reuses_response() {
        let provider = CachedProvider::new(Arc::new(FakeModel::new()));
        let messages = [Message {
            role: Role::User,
            content: "INPUT A".into(),
            tool_call_id: None,
        }];
        let config = GenerationConfig::default();
        let first = provider.generate(&messages, &config).await.unwrap();
        let second = provider.generate(&messages, &config).await.unwrap();
        assert_eq!(first.response_hash, second.response_hash);
        assert_eq!(provider.entries.lock().await.len(), 1);
    }
}
