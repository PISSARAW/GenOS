use std::process::Command;
use std::time::Duration;

struct Check {
    name: &'static str,
    status: &'static str,
    detail: &'static str,
}

fn command_available(command: &str) -> bool {
    Command::new(command).arg("--version").output().is_ok_and(|output| output.status.success())
}

fn backend_ready() -> bool {
    reqwest::blocking::Client::builder().no_proxy().timeout(Duration::from_secs(2)).build()
        .and_then(|client| client.get("http://127.0.0.1:4000/readyz").send())
        .is_ok_and(|response| response.status().is_success())
}

fn host_sampling_status() -> (&'static str, &'static str) {
    if std::env::var("GENOS_MCP_PROVIDER").is_ok() {
        ("~ degraded", "host declared; sampling capability not verified")
    } else {
        ("? unknown", "no host sampling declaration")
    }
}

fn run_checks() -> Vec<Check> {
    let sampling = host_sampling_status();
    vec![
        Check { name: "GenOS CLI", status: "✓ available", detail: "running" },
        command_check("Node.js", "node", "required for backend orchestration"),
        command_check("Git", "git", "repository operations"),
        backend_check(),
        Check { name: "MCP host", status: "? unknown", detail: "no host connection probe is configured" },
        Check { name: "Sampling", status: sampling.0, detail: sampling.1 },
        Check { name: "Model provenance", status: "? unknown", detail: "model identity must be declared by the host" },
        command_check("Lean", "lean", "optional formal verifier"),
        command_check("Z3", "z3", "optional SMT solver"),
        Check { name: "Workspace index", status: "? unknown", detail: "no registered daemon was queried" },
        Check { name: "Sandbox", status: "? unknown", detail: "runtime policy is not exposed by a local probe" },
    ]
}

fn command_check(name: &'static str, command: &str, detail: &'static str) -> Check {
    Check { name, status: if command_available(command) { "✓ available" } else { "✕ unavailable" }, detail }
}

fn backend_check() -> Check {
    Check {
        name: "Backend + database",
        status: if backend_ready() { "✓ available" } else { "✕ unavailable" },
        detail: "GET /readyz on 127.0.0.1:4000",
    }
}

pub fn execute() -> Result<(), String> {
    println!("GenOS doctor");
    for check in run_checks() {
        println!("{}  {:<22} {}", check.status, check.name, check.detail);
    }
    Ok(())
}
