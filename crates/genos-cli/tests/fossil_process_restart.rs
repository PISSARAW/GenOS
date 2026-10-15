use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::process::{Command, Output};
use tempfile::TempDir;
use uuid::Uuid;

struct FossilFixture {
    root: TempDir,
    fossil_id: Uuid,
    artifact: PathBuf,
}

#[test]
fn backend_compatible_fossil_survives_cli_process_restarts_as_read_only_unverified_provenance() {
    let fixture = backend_artifact();
    let original = std::fs::read(&fixture.artifact).unwrap();

    let listed = run_cli(&fixture, &["fossil", "list"]);
    assert!(listed.status.success(), "{}", stderr(&listed));
    let list: Value = serde_json::from_slice(&listed.stdout).unwrap();
    assert_eq!(list["total_fossils"], 1);
    assert_eq!(list["fossils"][0]["provenance_status"], "source_event_present_not_verified_by_local_cli");
    assert_eq!(list["fossils"][0]["record"]["payload_hash"], hash(&mineral_material(true)));

    let excavated = run_cli(&fixture, &["fossil", "excavate", "--fossil-id", &fixture.fossil_id.to_string()]);
    assert!(excavated.status.success(), "{}", stderr(&excavated));
    let specimen: Value = serde_json::from_slice(&excavated.stdout).unwrap();
    assert_eq!(specimen["specimen"]["integrity_verified"], true);
    assert_eq!(specimen["provenance_status"], "source_event_present_not_verified_by_local_cli");
    assert_eq!(specimen["specimen"]["record"]["source_event_id"], "event-terminal-1");

    let decoded = run_cli(&fixture, &["fossil", "decode", "--fossil-id", &fixture.fossil_id.to_string()]);
    assert!(decoded.status.success(), "{}", stderr(&decoded));
    let reading: Value = serde_json::from_slice(&decoded.stdout).unwrap();
    assert_eq!(reading["provenance_status"], "source_event_present_not_verified_by_local_cli");
    assert_eq!(std::fs::read(&fixture.artifact).unwrap(), original, "CLI reads must not rewrite the artifact");
}

#[test]
fn malformed_and_integrity_invalid_candidates_fail_closed() {
    let fixture = backend_artifact();
    let value: Value = serde_json::from_slice(&std::fs::read(&fixture.artifact).unwrap()).unwrap();
    let tampered = fixture.root.path().join("fossils/tampered.json");
    let mut altered = value;
    altered["reason"] = json!("rewritten after sealing");
    std::fs::write(&tampered, serde_json::to_vec(&altered).unwrap()).unwrap();

    let integrity = run_cli(&fixture, &["fossil", "list"]);
    assert!(!integrity.status.success());
    assert!(stderr(&integrity).contains("integrity check failed"), "{}", stderr(&integrity));

    std::fs::remove_file(tampered).unwrap();
    std::fs::write(fixture.root.path().join("fossils/broken.json"), b"{bad-json").unwrap();
    let malformed = run_cli(&fixture, &["fossil", "list"]);
    assert!(!malformed.status.success());
    assert!(stderr(&malformed).contains("Invalid fossil candidate"), "{}", stderr(&malformed));
}

#[test]
fn legacy_unprovenanced_fossil_is_labeled_without_claiming_authorship() {
    let fixture = legacy_artifact();
    let output = run_cli(&fixture, &["fossil", "excavate", "--fossil-id", &fixture.fossil_id.to_string()]);
    assert!(output.status.success(), "{}", stderr(&output));
    let specimen: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(specimen["provenance_status"], "legacy_unprovenanced");
    assert_eq!(specimen["specimen"]["integrity_verified"], true);
}

fn backend_artifact() -> FossilFixture {
    let root = test_directory();
    let fossil_id = Uuid::new_v4();
    let material = mineral_material(true);
    let artifact = artifact_path(&root, fossil_id);
    let mut record = material.clone();
    record["fossil_id"] = json!(fossil_id.to_string());
    record["extinct_lineage_id"] = json!("lineage-terminal-1");
    record["stratum_id"] = json!("stratum-2026-10-15::org-1::project-1");
    record["conservation_quality"] = json!(1.0);
    record["payload_hash"] = json!(hash(&material));
    record["organization_id"] = json!("org-1");
    record["project_id"] = json!("project-1");
    record["stratum"] = json!("STRATIGRAPHIC_FOSSIL");
    std::fs::write(&artifact, serde_json::to_vec_pretty(&record).unwrap()).unwrap();
    FossilFixture { root, fossil_id, artifact }
}

fn legacy_artifact() -> FossilFixture {
    let root = test_directory();
    let fossil_id = Uuid::new_v4();
    let material = mineral_material(false);
    let artifact = artifact_path(&root, fossil_id);
    let mut record = material.clone();
    record["fossil_id"] = json!(fossil_id.to_string());
    record["extinct_lineage_id"] = json!("lineage-terminal-1");
    record["stratum_id"] = json!("stratum-2026-10-15");
    record["conservation_quality"] = json!(1.0);
    record["payload_hash"] = json!(hash(&material));
    record["stratum"] = json!("STRATIGRAPHIC_FOSSIL");
    std::fs::write(&artifact, serde_json::to_vec_pretty(&record).unwrap()).unwrap();
    FossilFixture { root, fossil_id, artifact }
}

fn mineral_material(with_source: bool) -> Value {
    let mut material = json!({
        "lineage_id": "lineage-terminal-1",
        "reason": "budget_exhausted",
        "recorded_at": "2026-10-15T12:00:00.000Z",
        "mode": "petrification",
        "hard_parts": ["lineage", "terminal-event"],
        "soft_parts_lost": [],
        "phenotype_markers": [],
        "mineral_payload": null,
    });
    if with_source {
        material["source_event_id"] = json!("event-terminal-1");
        material["source_event_hash"] = json!("a".repeat(64));
    }
    material
}

fn hash(value: &Value) -> String {
    format!("{:x}", Sha256::digest(serde_json::to_vec(value).unwrap()))
}

fn artifact_path(root: &TempDir, fossil_id: Uuid) -> PathBuf {
    let directory = root.path().join("fossils");
    std::fs::create_dir_all(&directory).unwrap();
    directory.join(format!("lineage-terminal-1_{fossil_id}.json"))
}

fn run_cli(fixture: &FossilFixture, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(args)
        .env("GENOS_STUDIO_ROOT", fixture.root.path())
        .output()
        .unwrap()
}

fn test_directory() -> TempDir {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target");
    tempfile::Builder::new().prefix("fossil-process-").tempdir_in(base).unwrap()
}

fn stderr(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).into_owned()
}
