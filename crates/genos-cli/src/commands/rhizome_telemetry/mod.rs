pub mod graph;
pub mod server;
pub mod simulator;

use serde_json::json;
use std::path::Path;

/// Starts the Rhizome telemetry server: an in-memory $G_t=(N_t, E_t)$ graph that mutates as the
/// runtime grows Capability Offshoots and Local Bridges, streamed live over WebSocket to a
/// D3-rendered dashboard instead of a terminal-only simulation.
pub fn run(port: u16) -> Result<(), String> {
    let runtime = tokio::runtime::Runtime::new().map_err(|e| format!("Runtime init error: {e}"))?;
    runtime.block_on(async move {
        let rhizome_graph = graph::RhizomeGraph::new();
        tokio::spawn(simulator::run_forever(rhizome_graph.clone()));

        let app = server::build_router(rhizome_graph);
        let addr = format!("0.0.0.0:{port}");
        let listener = tokio::net::TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Bind error on {addr}: {e}"))?;

        println!(
            "{}",
            json!({
                "success": true,
                "operation": "rhizome_telemetry_server",
                "dashboard": format!("http://127.0.0.1:{port}/"),
                "websocket": format!("ws://127.0.0.1:{port}/ws"),
                "graph_api": format!("http://127.0.0.1:{port}/api/graph"),
                "export_api": format!("http://127.0.0.1:{port}/api/export")
            })
        );

        axum::serve(listener, app)
            .await
            .map_err(|e| format!("Server error: {e}"))
    })
}

/// Runs a single budding/contraction pass headlessly and exports the resulting graph JSON so it
/// can be saved, replayed, or shared as proof of a mission decomposition.
pub fn export_snapshot(output_path: &str) -> Result<(), String> {
    let runtime = tokio::runtime::Runtime::new().map_err(|e| format!("Runtime init error: {e}"))?;
    runtime.block_on(async move {
        let rhizome_graph = graph::RhizomeGraph::new();
        simulator::run_one_pass(&rhizome_graph).await;
        let snapshot = rhizome_graph.snapshot().await;
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
