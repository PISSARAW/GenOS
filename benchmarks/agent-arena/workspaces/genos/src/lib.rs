// Middleware de validation de jetons d'authentification et de limitation de débit

use sha2::{Sha256, Digest};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::{Instant, Duration};

struct AuthMiddleware {
    token_hash: Mutex<HashMap<String, Instant>>,
    rate_limit: Duration,
}

impl AuthMiddleware {
    fn new(rate_limit: Duration) -> Self {
        AuthMiddleware {
            token_hash: Mutex::new(HashMap::new()),
            rate_limit,
        }
    }

    fn validate_token(&self, token: &str) -> bool {
        if token.len() != 44 || !token.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
            return false;
        }

        let mut hasher = Sha256::new();
        hasher.update(token);
        let token_hash = hasher.finalize().to_vec();

        let now = Instant::now();
        let mut token_hash_map = self.token_hash.lock();

        if let Some(&last_seen) = token_hash_map.get(&hex::encode(&token_hash)) {
            if now - last_seen < self.rate_limit {
                return false;
            }
        }

        token_hash_map.insert(hex::encode(&token_hash), now);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_token() {
        let middleware = AuthMiddleware::new(Duration::from_secs(10));
        let token = "a-valid-token-12345";

        assert!(middleware.validate_token(token));
        assert!(!middleware.validate_token(token));
    }

    #[test]
    fn test_token_length_and_charset() {
        let middleware = AuthMiddleware::new(Duration::from_secs(10));
        let token_too_short = "short";
        let token_too_long = "a-very-very-long-token-that-is-too-long";
        let token_invalid_char = "a!valid_token";

        assert!(!middleware.validate_token(token_too_short));
        assert!(!middleware.validate_token(token_too_long));
        assert!(!middleware.validate_token(token_invalid_char));
    }

    #[test]
    fn test_rate_limiting() {
        let middleware = AuthMiddleware::new(Duration::from_secs(1));
        let token = "another-token";

        assert!(middleware.validate_token(token));
        assert!(!middleware.validate_token(token));

        std::thread::sleep(Duration::from_secs(2));
        assert!(middleware.validate_token(token));
    }

    #[test]
    fn bench_10k() {
        let middleware = AuthMiddleware::new(Duration::from_secs(1));
        let token = "yet-another-token";

        let start = Instant::now();
        for _ in 0..10000 {
            assert!(middleware.validate_token(token));
        }
        let end = Instant::now();

        let duration = end - start;
        let mean_latency = duration / 10000;

        assert!(mean_latency < Duration::from_micros(1000));
    }
}
