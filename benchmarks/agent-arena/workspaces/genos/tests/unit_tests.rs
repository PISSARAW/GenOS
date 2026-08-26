// tests/unit_tests.rs

use secure_middleware::{authenticate, authorize};

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
    assert!(authorize("user", "resource"));
}

#[test]
fn test_authorize_invalid() {
    assert!(!authorize("user", "other_resource"));
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