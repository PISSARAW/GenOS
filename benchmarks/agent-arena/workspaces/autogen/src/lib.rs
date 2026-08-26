// src/lib.rs

use std::time::{Duration, Instant};

pub fn measure_latency() -> Duration {
    let start = Instant::now();
    // Simulate some work
    let end = Instant::now();
    end - start
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_measure_latency() {
        let latency = measure_latency();
        assert!(latency.as_nanos() > 0);
    }

    #[test]
    fn bench_10k() {
        for _ in 0..10000 {
            let latency = measure_latency();
            assert!(latency.as_nanos() < 1_000_000);
        }
    }
}