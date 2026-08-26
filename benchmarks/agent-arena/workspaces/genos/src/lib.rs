// src/lib.rs

use sha2::{Sha256, Digest};
use constant_time_eq::constant_time_eq;

pub fn authenticate(token: &str) -> bool {
    // Replace this with actual authentication logic
    token == "valid_token"
}

pub fn authorize(user_id: &str, resource: &str) -> bool {
    let mut hasher = Sha256::new();
    hasher.update(user_id);
    hasher.update(resource);
    let result: [u8; 32] = hasher.finalize().into();

    // Replace this with actual validation logic
    constant_time_eq(&result, &[0u8; 32])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_authenticate_valid() {
        assert!(authenticate("valid_token"));
    }

    #[test]
    fn test_authenticate_invalid() {
        assert!(!authenticate("invalid_token"));
    }

    #[test]
    fn test_authorize_valid() {
        let mut hasher = Sha256::new();
        hasher.update("user");
        hasher.update("resource");
        let expected: [u8; 32] = hasher.finalize().into();
        assert!(constant_time_eq(&expected, &[0u8; 32]));
    }

    #[test]
    fn test_authorize_invalid() {
        let mut hasher = Sha256::new();
        hasher.update("user");
        hasher.update("other_resource");
        let expected: [u8; 32] = hasher.finalize().into();
        assert!(!constant_time_eq(&expected, &[0u8; 32]));
    }

    #[test]
    fn bench_10k() {
        let mut total_time = 0;
        for _ in 0..10000 {
            let start = std::time::Instant::now();
            authorize("user", "resource");
            let duration = start.elapsed().as_micros();
            total_time += duration;
        }
        let mean_latency = total_time as f64 / 10000.0;
        assert!(mean_latency < 1.0);
    }
}