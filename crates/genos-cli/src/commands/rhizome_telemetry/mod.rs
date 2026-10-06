pub mod graph;
pub mod live_server;
pub mod live_source;
pub mod server;
pub mod simulator;

use crate::commands::output_guard::WriteOptions;
use crate::commands::output_guard::write_output_file;
use serde_json::json;

/// Rejects the legacy implicit simulation entry point; a telemetry source must be explicit.
pub fn run(_port: u16) -> Result<(), String> {
    Err("Live telemetry requires rhizome serve --session-id ID --database PATH; use --simulate for the demonstration.".into())
}

pub fn run_simulation(port: u16) -> Result<(), String> {
    let runtime = tokio::runtime::Runtime::new().map_err(|e| format!("Runtime init error: {e}"))?;
    runtime.block_on(async move {
        let rhizome_graph = graph::RhizomeGraph::new();
        tokio::spawn(simulator::run_forever(rhizome_graph.clone()));

        let app = server::build_router(rhizome_graph);
        let addr = format!("127.0.0.1:{port}");
        let listener = tokio::net::TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Bind error on {addr}: {e}"))?;

        println!(
            "{}",
            json!({
                "success": true,
                "operation": "rhizome_telemetry_simulator",
                "source": "simulation",
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

async fn render_snapshot_async() -> Result<String, String> {
    let rhizome_graph = graph::RhizomeGraph::new();
    simulator::run_one_pass(&rhizome_graph).await;
    let snapshot = rhizome_graph.snapshot().await;
    let mut value = serde_json::to_value(snapshot).map_err(|error| error.to_string())?;
    value["source"] = json!("simulation");
    match serde_json::to_string_pretty(&value) {
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

/// Exports an explicitly labelled demonstration snapshot; this is not mission evidence.
pub fn export_snapshot(output_path: &str, opts: &WriteOptions) -> Result<(), String> {
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
        let opts = WriteOptions {
            force: true,
            parents: true,
        };
        assert!(export_snapshot("x/../evil.json", &opts).is_err());
    }
}

pub fn export_live(
    source: &live_source::LiveSource,
    output: &str,
    opts: &WriteOptions,
) -> Result<(), String> {
    let value = source.read()?;
    let body = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
    write_output_file(output, &body, opts)
}
