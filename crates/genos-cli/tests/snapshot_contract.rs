use std::fs;
use std::process::Command;

#[test]
fn snapshot_validate_rejects_missing_required_fields() {
    let path = std::env::temp_dir().join(format!("genos-invalid-snapshot-{}.json", std::process::id()));
    fs::write(&path, r#"{"snapshot_id":"only-id"}"#).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_genos")).args(["snapshot", "validate", "--file", path.to_str().unwrap()]).output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("Missing required"));
    let _ = fs::remove_file(path);
}