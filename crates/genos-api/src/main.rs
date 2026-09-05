use genos_api::security::{RateLimiter, TenantAuth};
use genos_api::server::start_server;
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut port: u16 = 8085;
    let mut host = "127.0.0.1".to_string();
    let mut api_key: Option<String> = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" => {
                if i + 1 < args.len() {
                    port = args[i + 1].parse().unwrap_or(8085);
                    i += 1;
                }
            }
            "--host" => {
                if i + 1 < args.len() {
                    host = args[i + 1].clone();
                    i += 1;
                }
            }
            "--api-key" => {
                if i + 1 < args.len() {
                    api_key = Some(args[i + 1].clone());
                    i += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }

    if let Ok(p_str) = env::var("GENOS_API_PORT") {
        if let Ok(p) = p_str.parse() {
            port = p;
        }
    }

    let mut auth = TenantAuth::new();
    if let Some(key) = api_key {
        auth.register_tenant("default_tenant", &key);
    } else {
        // Register development key
        auth.register_tenant("admin_dev", "sk-genos-dev-key");
    }

    let limiter = RateLimiter::new(100, 10);
    println!("Starting GenOS REST API Server (OpenAI-compatible) on http://{}:{}", host, port);

    let addr = format!("{}:{}", host, port);
    if let Err(e) = start_server(&addr, auth, limiter) {
        eprintln!("Error starting GenOS API server: {}", e);
        std::process::exit(1);
    }
}
