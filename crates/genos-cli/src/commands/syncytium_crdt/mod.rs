pub mod crdt;
pub mod server;
pub mod simulator;
pub mod types;

#[cfg(test)]
pub mod tests;

use serde_json::json;
use std::path::Path;

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

pub fn export_snapshot(output_path: &str, _mission: &str) -> Result<(), String> {
    let runtime = tokio::runtime::Runtime::new().map_err(|e| format!("Runtime init error: {e}"))?;
    runtime.block_on(async move {
        let engine = crdt::SyncytiumEngine::new();
        simulator::run_one_pass(&engine).await;
        let snapshot = engine.snapshot().await;
        let body = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| format!("Serialize error: {e}"))?;

        if let Some(parent) = Path::new(output_path).parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create dir error: {e}"))?;
            }
        }
        std::fs::write(output_path, body).map_err(|e| format!("Write error: {e}"))
    })
}
