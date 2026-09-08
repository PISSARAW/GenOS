use genos_api::security::{RateLimiter, TenantAuth};
use genos_api::server::start_server;
use std::env;

fn print_help() {
    println!("GenOS REST API Server\n\nUsage: genos-api [OPTIONS]\n\nOptions:\n  --host <HOST>       Bind address (default: 127.0.0.1)\n  --port <PORT>       Bind port (default: 8085)\n  --api-key <KEY>     Development API key\n  -h, --help          Print this help\n  -V, --version       Print version");
}

fn parse_args(args: &[String]) -> Result<Option<(String, u16, Option<String>)>, String> {
    let mut host = "127.0.0.1".to_string();
    let mut port: u16 = 8085;
    let mut api_key = None;
    let mut index = 1;
    while index < args.len() {
        let option = args[index].as_str();
        if matches!(option, "-h" | "--help") {
            print_help();
            return Ok(None);
        }
        if matches!(option, "-V" | "--version") {
            println!("genos-api 0.1.0");
            return Ok(None);
        }
        let value = args.get(index + 1).ok_or_else(|| format!("Missing value for {}.", option))?;
        match option {
            "--port" => port = value.parse().map_err(|_| format!("Invalid port '{}'.", value))?,
            "--host" => host = value.clone(),
            "--api-key" => api_key = Some(value.clone()),
            _ => return Err(format!("Unknown option '{}'. Use --help for usage.", option)),
        }
        index += 2;
    }
    Ok(Some((host, port, api_key)))
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let (host, mut port, api_key) = match parse_args(&args) {
        Ok(Some(parsed)) => parsed,
        Ok(None) => return,
        Err(error) => { eprintln!("genos-api: {}", error); std::process::exit(2); }
    };

    if let Ok(p_str) = env::var("GENOS_API_PORT") {
        port = p_str.parse().unwrap_or_else(|_| { eprintln!("Invalid GENOS_API_PORT '{}'.", p_str); std::process::exit(2); });
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
