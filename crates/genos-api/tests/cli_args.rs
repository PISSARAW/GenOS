use std::process::Command;

#[test]
fn api_help_exits_without_starting_server() {
    let output = Command::new(env!("CARGO_BIN_EXE_genos-api")).arg("--help").output().unwrap();
    assert!(output.status.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("Usage: genos-api"));
}

#[test]
fn api_rejects_invalid_port() {
    let output = Command::new(env!("CARGO_BIN_EXE_genos-api")).args(["--port", "abc"]).output().unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("Invalid port"));
}