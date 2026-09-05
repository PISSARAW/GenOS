use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct RateLimiter {
    pub capacity: u32,
    pub refill_per_sec: u32,
    tokens: u32,
}

impl RateLimiter {
    pub fn new(capacity: u32, refill_per_sec: u32) -> Self {
        Self {
            capacity,
            refill_per_sec,
            tokens: capacity,
        }
    }

    pub fn try_acquire(&mut self, cost: u32) -> bool {
        if self.tokens >= cost {
            self.tokens -= cost;
            true
        } else {
            false
        }
    }

    pub fn refill(&mut self, seconds: u32) {
        self.tokens = (self.tokens + seconds * self.refill_per_sec).min(self.capacity);
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
}
