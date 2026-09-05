use genos_api::security::{RateLimiter, TenantAuth};
use genos_api::server::start_server;

pub fn handle_serve(host: &str, port: u16, api_key: Option<&str>) -> Result<(), String> {
    let mut auth = TenantAuth::new();
    if let Some(key) = api_key {
        auth.register_tenant("default_tenant", key);
    } else {
        auth.register_tenant("admin_dev", "sk-genos-dev-key");
    }

    let limiter = RateLimiter::new(100, 10);
    let addr = format!("{}:{}", host, port);
    println!("Starting GenOS REST API Server on http://{}", addr);

    start_server(&addr, auth, limiter)
}
