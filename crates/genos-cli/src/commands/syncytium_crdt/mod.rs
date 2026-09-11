pub mod crdt;
pub mod server;
pub mod simulator;
pub mod types;

#[cfg(test)]
pub mod tests;

use serde_json::json;
use crate::commands::output_guard::WriteOptions;
use crate::commands::output_guard::write_output_file;

pub fn run(port: u16, mission: &str) -> Result<(), String> {
    let runtime = tokio::runtime::Runtime::new().map_err(|e| format!("Runtime init error: {e}"))?;
    let mission_str = mission.to_string();
    runtime.block_on(async move {
        let engine = crdt::SyncytiumEngine::new();
        tokio::spawn(simulator::run_forever(engine.clone()));

        let app = server::build_router(engine);
        // Loopback-only by default: the Syncytium server has no built-in user
        // auth, so it must not be reachable from the network unless the
        // operator explicitly opts in with GENOS_SYNCYTIUM_BIND.
        let bind_host = std::env::var("GENOS_SYNCYTIUM_BIND").unwrap_or_else(|_| "127.0.0.1".to_string());
        let is_loopback = bind_host == "localhost" || bind_host == "::1" || bind_host == "[::1]" || bind_host.starts_with("127.");
        let has_token = std::env::var("GENOS_SYNCYTIUM_TOKEN").map(|token| !token.is_empty()).unwrap_or(false);
        if !is_loopback && !has_token {
            return Err("Refusing to bind Syncytium to a non-loopback address without GENOS_SYNCYTIUM_TOKEN.".to_string());
        }
        let addr = format!("{bind_host}:{port}");
        let listener = tokio::net::TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Bind error on {addr}: {e}"))?;

        println!(
            "{}",
            json!({
                "success": true,
                "operation": "syncytium_crdt_server",
                "mode": "syncytium",
                "mission": mission_str,
                "frequency": "< 1s (300ms)",
                "dashboard": format!("http://127.0.0.1:{port}/"),
                "websocket": format!("ws://127.0.0.1:{port}/ws"),
                "state_api": format!("http://127.0.0.1:{port}/api/syncytium/state"),
                "history_api": format!("http://127.0.0.1:{port}/api/syncytium/history"),
                "rewind_api": format!("http://127.0.0.1:{port}/api/syncytium/rewind")
            })
        );

        axum::serve(listener, app)
            .await
            .map_err(|e| format!("Server error: {e}"))
    })
}

async fn render_snapshot_async() -> Result<String, String> {
    let engine = crdt::SyncytiumEngine::new();
    simulator::run_one_pass(&engine).await;
    let snapshot = engine.snapshot().await;
    match serde_json::to_string_pretty(&snapshot) {
        Ok(body) => Ok(body),
        Err(error) => Err(format!("Serialize error: {error}")),
    }
}

fn render_snapshot_body() -> Result<String, String> {
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(valid) => valid,
        Err(error) => return Err(format!("Runtime init error: {error}")),
    };
    runtime.block_on(render_snapshot_async())
}

pub fn export_snapshot(output_path: &str, _mission: &str, opts: &WriteOptions) -> Result<(), String> {
    let body = match render_snapshot_body() {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    match write_output_file(output_path, &body, opts) {
        Ok(()) => Ok(()),
        Err(reason) => Err(reason),
    }
}

#[cfg(test)]
mod export_guard_tests {
    use super::export_snapshot;
    use crate::commands::output_guard::WriteOptions;

    #[test]
    fn refuses_dotdot_output() {
        let opts = WriteOptions { force: true, parents: true };
        assert!(export_snapshot("x/../evil.json", "m", &opts).is_err());
    }
}
