use std::collections::HashMap;
use std::time::Instant;

#[derive(Clone, Debug)]
pub struct RateLimiter {
    pub capacity: u32,
    pub refill_per_sec: u32,
    tokens: u32,
    last_refill: Instant,
}

impl RateLimiter {
    pub fn new(capacity: u32, refill_per_sec: u32) -> Self {
        Self {
            capacity,
            refill_per_sec,
            tokens: capacity,
            last_refill: Instant::now(),
        }
    }

    pub fn try_acquire(&mut self, cost: u32) -> bool {
        let elapsed = self.last_refill.elapsed().as_secs();
        if elapsed > 0 {
            self.tokens = self
                .tokens
                .saturating_add((elapsed as u32).saturating_mul(self.refill_per_sec))
                .min(self.capacity);
            self.last_refill += std::time::Duration::from_secs(elapsed);
        }
        if self.tokens >= cost {
            self.tokens -= cost;
            true
        } else {
            false
        }
    }

    pub fn refill(&mut self, seconds: u32) {
        self.tokens = self
            .tokens
            .saturating_add(seconds.saturating_mul(self.refill_per_sec))
            .min(self.capacity);
        self.last_refill = Instant::now();
    }
}

pub struct TenantAuth {
    keys: HashMap<String, String>,
}

impl Default for TenantAuth {
    fn default() -> Self {
        Self::new()
    }
}

impl TenantAuth {
    pub fn new() -> Self {
        Self {
            keys: HashMap::new(),
        }
    }

    pub fn register_tenant(&mut self, tenant_id: &str, api_key: &str) {
        self.keys.insert(api_key.to_string(), tenant_id.to_string());
    }

    pub fn verify_key<'a>(&'a self, api_key: &str) -> Option<&'a str> {
        self.keys.get(api_key).map(|s| s.as_str())
    }

    pub fn has_keys(&self) -> bool {
        !self.keys.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::RateLimiter;
    use std::time::{Duration, Instant};

    #[test]
    fn token_bucket_refills_automatically_after_elapsed_time() {
        let mut limiter = RateLimiter::new(1, 1);
        assert!(limiter.try_acquire(1));
        assert!(!limiter.try_acquire(1));
        limiter.last_refill = Instant::now() - Duration::from_secs(1);
        assert!(limiter.try_acquire(1));
    }
}
