use serde_json::{json, Value};
use std::env;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

const DEFAULT_TOOL_TIMEOUT_MS: u64 = 30_000;
pub const MAX_OUTPUT_BYTES: usize = 1024 * 1024;

fn tool_timeout_ms() -> u64 {
    env::var("GENOS_MCP_TOOL_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .map(|value| value.min(30 * 60 * 1000))
        .unwrap_or(DEFAULT_TOOL_TIMEOUT_MS)
}

pub fn read_bounded(mut stream: impl Read) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 8192];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => {
                bytes.extend_from_slice(&chunk[..count]);
                if bytes.len() > MAX_OUTPUT_BYTES {
                    let excess = bytes.len() - MAX_OUTPUT_BYTES;
                    bytes.drain(..excess);
                }
            }
            Err(_) => break,
        }
    }
    bytes
}

fn bounded_output(bytes: Vec<u8>) -> String {
    let start = bytes.len().saturating_sub(MAX_OUTPUT_BYTES);
    String::from_utf8_lossy(&bytes[start..]).to_string()
}

fn terminate_process_group(child: &mut Child) {
    #[cfg(unix)]
    {
        unsafe { libc::kill(-(child.id() as i32), libc::SIGTERM); }
    }
    #[cfg(windows)]
    {
        let pid = child.id();
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
        let _ = child.kill();
    }
    #[cfg(all(not(unix), not(windows)))]
    {
        let _ = child.kill();
    }
}

pub fn execute_command(mut command: Command) -> Result<(i32, String), String> {
    #[cfg(unix)]
    unsafe {
        command.pre_exec(|| {
            if libc::setsid() == -1 { return Err(std::io::Error::last_os_error()); }
            Ok(())
        });
    }
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let stdout = child.stdout.take().map(|stream| thread::spawn(move || read_bounded(stream)));
    let stderr = child.stderr.take().map(|stream| thread::spawn(move || read_bounded(stream)));
    let deadline = Instant::now() + Duration::from_millis(tool_timeout_ms());
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                terminate_process_group(&mut child);
                let _ = child.wait();
                return Err(format!("MCP tool timed out after {}ms.", tool_timeout_ms()));
            }
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                terminate_process_group(&mut child);
                let _ = child.wait();
                return Err(error.to_string());
            }
        }
    };
    let stdout = stdout.and_then(|thread| thread.join().ok()).unwrap_or_default();
    let stderr = stderr.and_then(|thread| thread.join().ok()).unwrap_or_default();
    let code = status.code().unwrap_or(-1);
    let stdout_text = bounded_output(stdout);
    let stderr_text = bounded_output(stderr);
    let text = if code == 0 {
        stdout_text
    } else if stdout_text.is_empty() {
        stderr_text
    } else if stderr_text.is_empty() {
        stdout_text
    } else {
        format!("{}\n{}", stdout_text, stderr_text)
    };
    Ok((code, text))
}

fn find_in_env() -> Option<PathBuf> {
    env::var("GENOS_BIN")
        .ok()
        .map(PathBuf::from)
        .filter(|p| p.is_file())
}

fn find_near_current_exe(exe_name: &str) -> Option<PathBuf> {
    let current = env::current_exe().ok()?;
    let candidate = current.with_file_name(exe_name);
    if candidate.is_file() {
        return Some(candidate);
    }
    let repo_root = current.parent()?.parent()?.parent()?;
    for sub in &["target/release", "target/debug"] {
        let cand = repo_root.join(sub).join(exe_name);
        if cand.is_file() {
            return Some(cand);
        }
    }
    None
}

fn find_in_workspace(workspace: &Path, exe_name: &str) -> Option<PathBuf> {
    for sub in &[
        "target/debug",
        "target/release",
        "../target/debug",
        "../target/release",
        "../../target/debug",
        "../../target/release",
    ] {
        let candidate = workspace.join(sub).join(exe_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn find_genos_binary(workspace: &Path) -> Option<PathBuf> {
    if let Some(p) = find_in_env() {
        return Some(p);
    }
    let exe_name = if cfg!(windows) { "genos.exe" } else { "genos" };
    find_near_current_exe(exe_name).or_else(|| find_in_workspace(workspace, exe_name))
}

fn resolve_bridge_path(workspace: &Path) -> PathBuf {
    if let Ok(val) = env::var("GENOS_ORCHESTRATOR_BRIDGE") {
        let p = PathBuf::from(val);
        if p.is_file() {
            return p;
        }
    }
    let local = workspace.join("backend/bin/genos-orchestrate.cjs");
    if local.is_file() {
        return local;
    }
    if let Ok(current) = env::current_exe() {
        if let Some(parent) = current.parent() {
            if let Some(repo_root) = parent.parent().and_then(|p| p.parent()) {
                let candidate = repo_root.join("backend/bin/genos-orchestrate.cjs");
                if candidate.is_file() {
                    return candidate;
                }
            }
            let candidate = parent.join("backend/bin/genos-orchestrate.cjs");
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    local
}

fn execute_orchestrator(bridge: &Path, payload: &Value, workspace: &Path) -> (i32, String) {
    let payload_str = payload.to_string();
    let mut cmd = Command::new("node");
    cmd.arg(bridge)
        .arg(&payload_str)
        .current_dir(workspace);

    cmd.env("GENOS_WORKSPACE_ROOT", workspace);

    if let Ok(mode) = env::var("GENOS_EXECUTION_MODE") {
        cmd.env("GENOS_EXECUTION_MODE", mode);
    }
    if let Ok(id) = env::var("GENOS_AGENT_ID") {
        cmd.env("GENOS_AGENT_ID", id);
    }
    if let Ok(orch) = env::var("GENOS_ORCHESTRATOR_AGENT_ID") {
        cmd.env("GENOS_ORCHESTRATOR_AGENT_ID", orch);
    }

    match execute_command(cmd) {
        Ok(result) => result,
        Err(error) => (-1, format!("Failed to invoke orchestrator bridge: {error}")),
    }
}

fn build_cli_args(name: &str, args: &Value) -> Vec<String> {
    match name {
        "genos_snapshot" => {
            let agent = args.get("agent").and_then(Value::as_str).unwrap_or("default-agent");
            let out = args.get("out").and_then(Value::as_str).unwrap_or("snapshots/mcp-snapshot.json");
            vec!["snapshot".into(), "create".into(), "--agent".into(), agent.into(), "--out".into(), out.into()]
        }
        "genos_replay" => {
            let snapshot = args.get("snapshot")
                .or_else(|| args.get("snapshot_id"))
                .and_then(Value::as_str)
                .unwrap_or("");
            vec!["replay".into(), "basic".into(), "--snapshot".into(), snapshot.into()]
        }
        "genos_capsule_create" => {
            let snap = args.get("snapshot_id").and_then(Value::as_str).unwrap_or("ROOT");
            let mut v = vec!["capsule".into(), "create".into(), "--snapshot".into(), snap.into()];
            if let Some(seed) = args.get("seed").and_then(Value::as_str) {
                v.push("--seed".into());
                v.push(seed.into());
            }
            v
        }
        "genos_merge" => {
            let branch = args.get("branch_id").and_then(Value::as_str).unwrap_or("HEAD");
            let mut v = vec!["merge".into(), branch.into()];
            if let Some(cond) = args.get("conditions").and_then(Value::as_str) {
                v.push("--conditions".into());
                v.push(cond.into());
            }
            v
        }
        "genos_audit" => {
            let snap = args.get("snapshot_id").and_then(Value::as_str).unwrap_or("ROOT");
            let out = args.get("output").and_then(Value::as_str).unwrap_or("audit.log");
            vec!["audit".into(), snap.into(), "--output".into(), out.into()]
        }
        "genos_biomimicry" => {
            let feat = args.get("feature").and_then(Value::as_str).unwrap_or("sar");
            let act = args.get("action").and_then(Value::as_str).unwrap_or("prime");
            let mut v = vec![
                "biomimicry".into(),
                "bio-feature".into(),
                "--feature".into(),
                feat.into(),
                "--action".into(),
                act.into(),
            ];
            if let Some(params) = args.get("params").and_then(Value::as_object) {
                for (k, val) in params {
                    let s = match val {
                        Value::String(str_val) => format!("{k}={str_val}"),
                        other => format!("{k}={other}"),
                    };
                    v.push("--param".into());
                    v.push(s);
                }
            }
            v
        }
        "genos_v2_init" => vec!["init".into()],
        "genos_v2_fork" => {
            let p = args.get("parent_id").and_then(Value::as_str).unwrap_or("ROOT");
            vec!["agent".into(), "fork".into(), "--parent-id".into(), p.into()]
        }
        _ => vec!["--help".into()],
    }
}

fn execute_cli(workspace: &Path, name: &str, args: &Value) -> (i32, String) {
    let cli_args = build_cli_args(name, args);
    let mut cmd = if let Some(bin) = find_genos_binary(workspace) {
        let mut c = Command::new(bin);
        c.args(&cli_args);
        c
    } else {
        let mut c = Command::new("cargo");
        c.args(["run", "-q", "--manifest-path", &workspace.join("Cargo.toml").to_string_lossy(), "-p", "genos-cli", "--"]);
        c.args(&cli_args);
        c
    };

    cmd.current_dir(workspace);
    match execute_command(cmd) {
        Ok(result) => result,
        Err(error) => (-1, format!("Failed to execute GenOS CLI: {error}")),
    }
}

fn with_action(args: &Value, action: &str) -> Value {
    let mut payload = args.clone();
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("action".into(), json!(action));
    }
    payload
}

fn bio_primitive_name(name: &str) -> Option<&'static str> {
    match name {
        "genos_swe_fault_localizer" => Some("swe_localize"),
        "genos_swe_surgical_repair" => Some("swe_patch_synthesize"),
        "genos_swe_verify_patch" => Some("swe_verify"),
        "genos_browser_act" => Some("browser_act"),
        "genos_foveal_crop" => Some("foveal_crop"),
        "genos_optimal_foraging" => Some("foraging_evaluate"),
        _ => None,
    }
}

fn orchestrator_action(name: &str) -> Option<&'static str> {
    match name {
        "genos_change_strategy" => Some("change_strategy"),
        "genos_report_progress" => Some("report_progress"),
        "genos_change_organization" => Some("change_organization"),
        "genos_worker_publish" => Some("organization_publish"),
        "genos_worker_inbox" => Some("organization_inbox"),
        "genos_trinity_launch" => Some("dispatch_trinity"),
        "genos_a_team_preview" => Some("dispatch_team"),
        _ => None,
    }
}

pub fn handle_tool_call(name: &str, args: &Value, workspace: &Path) -> (i32, String) {
    let bridge = resolve_bridge_path(workspace);
    if let Some(prim) = bio_primitive_name(name) {
        let mut payload = with_action(args, "execute_primitive");
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("primitive".into(), json!(prim));
        }
        return execute_orchestrator(&bridge, &payload, workspace);
    }
    if let Some(action) = orchestrator_action(name) {
        return execute_orchestrator(&bridge, &with_action(args, action), workspace);
    }
    match name {
        "genos_orchestrate" => {
            let mut payload = with_action(args, "orchestrate");
            if let Some(obj) = payload.as_object_mut() {
                obj.entry("background").or_insert_with(|| json!(false));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_delegate_worker" => {
            let mut payload = with_action(args, "dispatch_worker");
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("background".into(), json!(false));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_organization_state" => execute_orchestrator(&bridge, &json!({ "action": "organization_state" }), workspace),
        "genos_execute_primitive" => {
            let mut payload = with_action(args, "execute_primitive");
            if let Some(obj) = payload.as_object_mut() {
                if let Some(primitive) = obj.get("primitive_name").cloned() {
                    obj.insert("primitive".into(), primitive);
                }
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_snapshot"
        | "genos_replay"
        | "genos_capsule_create"
        | "genos_merge"
        | "genos_audit"
        | "genos_biomimicry"
        | "genos_v2_init"
        | "genos_v2_fork" => execute_cli(workspace, name, args),
        _ => (-1, format!("Unsupported MCP tool: {name}")),
    }
}
