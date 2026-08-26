use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, PartialEq)]
pub enum TokenError {
    TokenExpired,
    InvalidToken,
}

impl From<std::time::SystemTimeError> for TokenError {
    fn from(_: std::time::SystemTimeError) -> Self {
        TokenError::InvalidToken
    }
}

pub fn generate_token() -> Result<String, TokenError> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    Ok(format!("{}", now + 3600)) // Token valid for 1 hour
}

pub fn validate_token(token: &str) -> Result<(), TokenError> {
    let token_time: u64 = token.parse().map_err(|_| TokenError::InvalidToken)?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    if token_time > now {
        Ok(())
    } else {
        Err(TokenError::TokenExpired)
    }
}