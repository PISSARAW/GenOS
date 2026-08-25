// Rust code content for auth_system
// Implement the required functionalities as per SCENARIO.md

use hmac::{Hmac, NewMac};
use sha2::Sha256;
use subtle::constant_time::verify_slices_eq;

// Function to hash a token using SHA-256
fn hash_token(token: &str) -> hmac::MacResult<Sha256> {
    let key: hmac::Key<Sha256> = hmac::Key::new(Sha256::new(), b"secret_key");
    let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).unwrap();
    mac.update(token.as_bytes());
    mac.finalize()
}

// Function to authenticate a user with constant-time comparison
pub fn authenticate(user: &str, password: &str) -> bool {
    // Placeholder for actual user and password validation logic
    let expected_hash = hash_token("admin");
    let user_hash = hash_token(password);
    verify_slices_eq(expected_hash.as_ref(), user_hash.as_ref()).is_ok()
}

// Unit tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_authenticate_valid() {
        assert!(authenticate("admin", "admin"));
    }

    #[test]
    fn test_authenticate_invalid() {
        assert!(!authenticate("user", "password"));
    }

    #[test]
    fn bench_10k() {
        let mut start = std::time::Instant::now();
        for _ in 0..10000 {
            authenticate("admin", "admin");
        }
        let duration = start.elapsed();
        let mean_latency = duration.as_nanos() as f64 / 10000.0;
        assert!(mean_latency < 1.0, "Mean latency: {} ns", mean_latency);
    }
}