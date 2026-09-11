use genos_api::security::{RateLimiter, TenantAuth};
use genos_api::server::start_server;

fn is_loopback_host(host: &str) -> bool {
    match host {
        "localhost" => true,
        "127.0.0.1" => true,
        "::1" => true,
        "[::1]" => true,
        _ => host.starts_with("127."),
    }
}

fn hex_char(value: u8) -> char {
    match value {
        0 => '0',
        1 => '1',
        2 => '2',
        3 => '3',
        4 => '4',
        5 => '5',
        6 => '6',
        7 => '7',
        8 => '8',
        9 => '9',
        10 => 'a',
        11 => 'b',
        12 => 'c',
        13 => 'd',
        14 => 'e',
        _ => 'f',
    }
}

fn generate_dev_key() -> String {
    let bytes = rand::random::<[u8; 16]>();
    let mut out = String::with_capacity(32);
    for byte in bytes {
        out.push(hex_char(byte >> 4));
        out.push(hex_char(byte & 0x0F));
    }
    out
}

fn auth_without_key(host: &str) -> Result<TenantAuth, String> {
    if is_loopback_host(host) {
        let mut auth = TenantAuth::new();
        let key = generate_dev_key();
        auth.register_tenant("admin_dev", &key);
        println!("Generated ephemeral dev API key (shown once): {}", key);
        return Ok(auth);
    }
    Err(format!("refusing to serve on non-loopback host '{}' without --api-key", host))
}

fn auth_for_host(host: &str, api_key: Option<&str>) -> Result<TenantAuth, String> {
    match api_key {
        Some(key) => {
            let mut auth = TenantAuth::new();
            auth.register_tenant("default_tenant", key);
            Ok(auth)
        }
        None => auth_without_key(host),
    }
}

pub fn handle_serve(host: &str, port: u16, api_key: Option<&str>) -> Result<(), String> {
    let auth = match auth_for_host(host, api_key) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    let limiter = RateLimiter::new(100, 10);
    let addr = format!("{}:{}", host, port);
    println!("Starting GenOS REST API Server on http://{}", addr);

    start_server(&addr, auth, limiter)
}

#[cfg(test)]
mod serve_tests {
    use super::auth_for_host;
    use super::generate_dev_key;
    use super::is_loopback_host;

    #[test]
    fn loopback_is_allowed() {
        assert!(is_loopback_host("127.0.0.1"));
    }

    #[test]
    fn non_loopback_is_detected() {
        assert!(!is_loopback_host("0.0.0.0"));
    }

    #[test]
    fn non_loopback_without_key_is_refused() {
        assert!(auth_for_host("0.0.0.0", None).is_err());
    }

    #[test]
    fn loopback_without_key_gets_auth() {
        assert!(auth_for_host("127.0.0.1", None).is_ok());
    }

    #[test]
    fn generated_key_has_expected_length() {
        assert_eq!(generate_dev_key().len(), 32);
    }
}
