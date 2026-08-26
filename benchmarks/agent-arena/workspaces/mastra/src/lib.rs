mod token;

#[cfg(test)]
mod tests {
    use super::token::{generate_token, validate_token, TokenError};

    #[test]
    fn test_generate_token() {
        assert!(generate_token().is_ok());
    }

    #[test]
    fn test_validate_token() {
        let token = generate_token().unwrap();
        assert!(validate_token(&token).is_ok());
        assert_eq!(validate_token("0").unwrap_err(), TokenError::TokenExpired);
    }

    #[test]
    fn bench_10k() {
        let mut tokens = Vec::new();
        for _ in 0..10000 {
            tokens.push(generate_token().unwrap());
        }
        let start = std::time::Instant::now();
        for token in &tokens {
            validate_token(token).unwrap();
        }
        let duration = start.elapsed();
        assert!(duration.as_secs_f64() < 1.0);
    }
}