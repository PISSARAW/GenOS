use rusqlite::{Connection, OpenFlags};
use serde_json::{Value, json};
use std::collections::BTreeSet;
use std::path::Path;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};
use tempfile::TempDir;

fn workspace() -> TempDir {
    let directory = TempDir::new().unwrap();
    std::fs::write(directory.path().join("numbers.json"), b"[7,-2,3]").unwrap();
    directory
}

fn objective(path: &str, expected: i64) -> Value {
    json!([{"goal":"Somme des entiers avec deux vérificateurs indépendants",
        "successCriteria":["integer_sum_verified"],"methodContract":{"version":1,
            "methodId":"integer_sum","parameters":{"inputPath":path,"expectedSum":expected}}}])
}

fn command(directory: &Path, mission: &str, native: &Value) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_genos"));
    command.args(["run", "Somme native vérifiée", "--executor", "rust", "--workspace-root"])
        .arg(directory).args(["--mission-id", mission, "--timeout-ms", "30000", "--native-objectives"])
        .arg(serde_json::to_string(native).unwrap()).env("PATH", directory);
    command
}

fn report(output: Output) -> Value {
    assert!(output.status.success(), "native CLI failed: {}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

fn database(directory: &Path) -> Connection {
    Connection::open_with_flags(directory.join(".genos-native/mission-protocols.sqlite"),
        OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap()
}

fn proofs(connection: &Connection, run: &str) -> Value {
    let raw: String = connection.query_row("SELECT proofs_json FROM rust_mission_evidence WHERE run_id=?1",
        [run], |row| row.get(0)).unwrap();
    serde_json::from_str(&raw).unwrap()
}

fn assert_process_proofs(value: &Value) {
    let rows = value.as_array().unwrap();
    let pids: BTreeSet<_> = rows.iter().map(|row| row["pid"].as_u64().unwrap()).collect();
    let roles: BTreeSet<_> = rows.iter().map(|row| row["role"].as_str().unwrap()).collect();
    assert_eq!(rows.len(), 3);
    assert_eq!(pids.len(), 3);
    assert!(!pids.contains(&0));
    assert!(!pids.contains(&u64::from(std::process::id())));
    assert_eq!(roles, BTreeSet::from(["producer", "verifier_a", "verifier_b"]));
}

fn assert_publication(connection: &Connection, result: &Value) {
    let (root, generation): (String, u64) = connection.query_row(
        "SELECT root_hash,generation FROM protocol_gqwf_heads", [], |row| Ok((row.get(0)?, row.get(1)?))).unwrap();
    assert_eq!(root, result["publication"]["root_hash"]);
    assert_eq!(generation, 1);
    assert_eq!(result["publication"]["generation"], 1);
    assert_eq!(result["publication"]["external_effects_authorized"], false);
    let state: String = connection.query_row("SELECT status FROM rust_protocol_runs WHERE run_id=?1",
        [result["binding"]["run_id"].as_str().unwrap()], |row| row.get(0)).unwrap();
    assert_eq!(state, "completed");
}

fn assert_native_report(result: &Value) {
    assert_eq!(result["schema"], "genos.rust-native-mission/v1");
    assert_eq!(result["status"], "completed");
    assert_eq!(result["verified"], true);
    assert_eq!(result["result"]["sum"], 8);
    assert_eq!(result["result"]["count"], 3);
    assert_eq!(result["usage"]["observed_processes"], 3);
    assert_eq!(result["usage"]["held_ms"], 0);
    assert_eq!(result["usage"]["active_slots"], 0);
    assert_eq!(result["usage"]["released"], true);
    let protocols = result["protocols"].as_array().unwrap();
    for name in ["EVIDENCE", "CONTINUITY", "MORPH", "SYNAPSE", "ALLOSTASIS", "OMEGA", "GQWF"] {
        assert!(protocols.contains(&json!(name)), "missing protocol {name}");
    }
}

#[test]
fn real_rust_cli_executes_three_processes_and_replays_committed_cas_without_node() {
    let directory = workspace();
    let mission = uuid::Uuid::new_v4().to_string();
    let native = objective("numbers.json", 8);
    let first = report(command(directory.path(), &mission, &native).output().unwrap());
    assert_native_report(&first);
    assert_eq!(first["replayed"], false);
    let connection = database(directory.path());
    assert_publication(&connection, &first);
    let initial_proofs = proofs(&connection, first["binding"]["run_id"].as_str().unwrap());
    assert_process_proofs(&initial_proofs);
    let replay = report(command(directory.path(), &mission, &native).output().unwrap());
    assert_eq!(replay["replayed"], true);
    assert_eq!(replay["binding"], first["binding"]);
    assert_eq!(replay["publication"], first["publication"]);
    assert_eq!(replay["usage"], first["usage"]);
    assert_eq!(proofs(&connection, replay["binding"]["run_id"].as_str().unwrap()), initial_proofs);
    assert_publication(&connection, &replay);
}

#[test]
fn false_expected_result_cannot_complete_native_mission_or_promote_head() {
    let directory = workspace();
    let mission = uuid::Uuid::new_v4().to_string();
    let output = command(directory.path(), &mission, &objective("numbers.json", 999)).output().unwrap();
    assert!(!output.status.success());
    let connection = database(directory.path());
    let completed: u32 = connection.query_row("SELECT count(*) FROM rust_protocol_runs WHERE status='completed'",
        [], |row| row.get(0)).unwrap();
    let generation: u64 = connection.query_row("SELECT generation FROM protocol_gqwf_heads", [], |row| row.get(0)).unwrap();
    assert_eq!(completed, 0);
    assert_eq!(generation, 0);
}

#[test]
fn traversal_is_refused_before_creating_runtime_journal() {
    let directory = workspace();
    let output = command(directory.path(), &uuid::Uuid::new_v4().to_string(), &objective("../outside.json", 8))
        .output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("CONFINED_RELATIVE"));
    assert!(!directory.path().join(".genos-native").exists());
}

#[test]
fn arbitrary_method_output_and_criteria_are_never_silently_accepted() {
    let directory = workspace();
    let mut cases = Vec::new();
    let mut unknown = objective("numbers.json", 8);
    unknown[0]["methodContract"]["parameters"]["outputPath"] = "result.json".into();
    cases.push(unknown);
    let mut unknown = objective("numbers.json", 8);
    unknown[0]["successCriteria"] = json!(["all free-form goals satisfied"]);
    cases.push(unknown);
    let mut unknown = objective("numbers.json", 8);
    unknown[0]["methodContract"]["methodId"] = "execute_shell".into();
    cases.push(unknown);
    let mut unknown = objective("numbers.json", 8);
    unknown[0]["proof"] = json!({"verified":true});
    cases.push(unknown);
    for value in cases {
        let output = command(directory.path(), &uuid::Uuid::new_v4().to_string(), &value).output().unwrap();
        assert!(!output.status.success());
    }
    assert!(!directory.path().join(".genos-native").exists());
    assert!(!directory.path().join("result.json").exists());
}

#[test]
fn completion_contract_and_tui_options_do_not_fall_back_to_another_executor() {
    let directory = workspace();
    let native = objective("numbers.json", 8);
    for flags in [vec!["--completion-contract", "{}"], vec!["--simulation"],
        vec!["--success-criteria", "[\"unverified success\"]"], vec!["--read-only-workspace-evidence"]] {
        let output = command(directory.path(), &uuid::Uuid::new_v4().to_string(), &native).args(flags).output().unwrap();
        assert!(!output.status.success());
    }
    assert!(!directory.path().join(".genos-native").exists());
}

#[test]
fn changed_source_or_changed_request_is_refused_on_replay() {
    let directory = workspace();
    let mission = uuid::Uuid::new_v4().to_string();
    report(command(directory.path(), &mission, &objective("numbers.json", 8)).output().unwrap());
    let changed = command(directory.path(), &mission, &objective("numbers.json", 9)).output().unwrap();
    assert!(!changed.status.success());
    std::fs::write(directory.path().join("numbers.json"), b"[8,-2,3]").unwrap();
    let changed = command(directory.path(), &mission, &objective("numbers.json", 8)).output().unwrap();
    assert!(!changed.status.success());
}

#[cfg(any(unix, windows))]
#[test]
fn dangling_runtime_database_symlink_cannot_create_a_database_outside_workspace() {
    let directory = workspace();
    let outside = TempDir::new().unwrap();
    let target = outside.path().join("outside.sqlite");
    let journal = directory.path().join(".genos-native");
    std::fs::create_dir(&journal).unwrap();
    let link = journal.join("mission-protocols.sqlite");
    if !symlink_available(&target, &link) { return; }
    let output = command(directory.path(), &uuid::Uuid::new_v4().to_string(), &objective("numbers.json", 8))
        .output().unwrap();
    assert!(!output.status.success());
    assert!(!target.exists(), "SQLite followed a dangling journal symlink outside workspace");
}

#[cfg(any(unix, windows))]
fn symlink_available(target: &Path, link: &Path) -> bool {
    #[cfg(unix)]
    let result = std::os::unix::fs::symlink(target, link);
    #[cfg(windows)]
    let result = std::os::windows::fs::symlink_file(target, link);
    match result {
        Ok(()) => true,
        Err(error) if cfg!(windows) && error.raw_os_error() == Some(1314) => {
            eprintln!("symlink case unavailable: Windows requires symlink creation privilege");
            false
        }
        Err(error) => panic!("cannot prepare symlink regression: {error}"),
    }
}

#[test]
fn hardlinked_runtime_database_cannot_modify_an_external_file() {
    let directory = workspace();
    let outside = TempDir::new().unwrap();
    let target = outside.path().join("outside.sqlite");
    std::fs::write(&target, b"").unwrap();
    let journal = directory.path().join(".genos-native");
    std::fs::create_dir(&journal).unwrap();
    std::fs::hard_link(&target, journal.join("mission-protocols.sqlite")).unwrap();
    let output = command(directory.path(), &uuid::Uuid::new_v4().to_string(), &objective("numbers.json", 8))
        .output().unwrap();
    assert!(!output.status.success());
    assert!(std::fs::read(target).unwrap().is_empty(), "SQLite modified a hardlinked external file");
}

#[test]
fn hardlinked_input_does_not_bypass_the_native_source_boundary() {
    let directory = workspace();
    let outside = TempDir::new().unwrap();
    let target = outside.path().join("outside.json");
    std::fs::write(&target, b"[7,-2,3]").unwrap();
    std::fs::hard_link(&target, directory.path().join("linked.json")).unwrap();
    let output = command(directory.path(), &uuid::Uuid::new_v4().to_string(), &objective("linked.json", 8))
        .output().unwrap();
    assert!(!output.status.success());
    assert!(!directory.path().join(".genos-native/mission-protocols.sqlite").exists());
    assert_eq!(std::fs::read(target).unwrap(), b"[7,-2,3]");
}

#[test]
fn rust_executor_without_mission_refuses_without_contacting_trinity_or_backend() {
    let directory = workspace();
    let no_options = bounded_output(missing_mission_command(directory.path()));
    assert!(!no_options.status.success());
    let missing = String::from_utf8_lossy(&no_options.stderr);
    assert!(missing.contains("MISSION_REQUIRED") || missing.contains("requires an explicit mission"), "{missing}");
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    listener.set_nonblocking(true).unwrap();
    let port = listener.local_addr().unwrap().port().to_string();
    let mut child = missing_mission_command(directory.path());
    child.args(["--port", &port]).env("GENOS_BACKEND_URL", format!("http://127.0.0.1:{port}"));
    let output = bounded_output(child);
    assert!(!output.status.success());
    let error = String::from_utf8_lossy(&output.stderr);
    assert!(error.contains("RUST_NATIVE") || error.contains("requires an explicit mission"), "{error}");
    assert!(matches!(listener.accept(), Err(error) if error.kind() == std::io::ErrorKind::WouldBlock));
    assert!(!directory.path().join(".genos-native").exists());
}

fn missing_mission_command(directory: &Path) -> Command {
    let mut child = Command::new(env!("CARGO_BIN_EXE_genos"));
    child.args(["run", "--executor", "rust", "--workspace-root"]).arg(directory)
        .arg("--native-objectives").arg(serde_json::to_string(&objective("numbers.json", 8)).unwrap())
        .env("PATH", directory);
    child
}

fn bounded_output(mut command: Command) -> Output {
    let mut child = command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while child.try_wait().unwrap().is_none() {
        if Instant::now() >= deadline {
            child.kill().unwrap();
            child.wait().unwrap();
            panic!("native CLI without mission did not fail within its bounded probe");
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    child.wait_with_output().unwrap()
}

#[test]
fn hardlinked_sqlite_wal_is_refused_before_database_open() {
    let directory = workspace();
    let outside = TempDir::new().unwrap();
    let target = outside.path().join("outside-wal");
    std::fs::write(&target, b"").unwrap();
    let journal = directory.path().join(".genos-native");
    std::fs::create_dir(&journal).unwrap();
    std::fs::hard_link(&target, journal.join("mission-protocols.sqlite-wal")).unwrap();
    let output = command(directory.path(), &uuid::Uuid::new_v4().to_string(), &objective("numbers.json", 8))
        .output().unwrap();
    assert!(!output.status.success());
    assert!(!journal.join("mission-protocols.sqlite").exists());
    assert!(std::fs::read(target).unwrap().is_empty(), "SQLite modified a hardlinked external WAL");
}
