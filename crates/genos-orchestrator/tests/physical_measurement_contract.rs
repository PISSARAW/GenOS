use genos_orchestrator::physical_measurements::*;
use genos_orchestrator::{physical_coverage, physical_dependencies, physical_workspace};
use std::fs;
use std::time::{Duration, SystemTime};
use tempfile::TempDir;

fn fixture() -> (TempDir, WorkspacePhysicsConfig) {
    let root = TempDir::new().unwrap();
    let mut config = WorkspacePhysicsConfig::for_root(root.path());
    config.scan_timeout = Duration::from_secs(5);
    (root, config)
}
fn write(root: &TempDir, name: &str, text: &str) {
    let path = root.path().join(name);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
#[test]
fn inventories_real_sizes_and_marks_limits() {
    let (root, mut config) = fixture();
    write(&root, "src/a.rs", "12345");
    write(&root, "node_modules/ignored", "ignored");
    let inventory = physical_workspace::inventory(&config);
    assert_eq!(inventory.status, MeasurementStatus::Measured);
    assert_eq!(inventory.value.as_ref().unwrap().files.len(), 1);
    assert_eq!(inventory.value.unwrap().bytes, 5);
    config.max_entries = 0;
    assert_eq!(
        physical_workspace::inventory(&config).status,
        MeasurementStatus::Partial
    );
}
#[test]
fn nested_manifests_and_actual_local_edges_are_measured() {
    let (root, config) = fixture();
    write(&root, "Cargo.toml", "[package]\nname='fixture'\nversion='0.1.0'\n[dependencies]\nserde='1'\n[target.'cfg(windows)'.dependencies]\nwinapi='0.3'\n");
    write(
        &root,
        "web/package.json",
        r#"{"dependencies":{"alpha":"1"},"devDependencies":{"beta":"1"}}"#,
    );
    write(&root, "src/lib.rs", "mod helper; use crate::{helper::run};");
    write(&root, "src/helper.rs", "pub fn run() {}");
    write(
        &root,
        "web/main.ts",
        "import { run } from './helper'; // require('./fake')\nconst text = \"require('./fake')\";",
    );
    write(&root, "web/helper.ts", "export const run = 1;");
    let inventory = physical_workspace::inventory(&config);
    let measurement = physical_dependencies::dependencies(&config, &inventory);
    assert_eq!(measurement.status, MeasurementStatus::Measured, "{measurement:?}");
    let graph = measurement.value.unwrap();
    assert_eq!(graph.declared_count(), 4);
    assert_eq!(graph.edge_count(), 2);
    assert!(graph.edges["src/lib.rs"].contains("src/helper.rs"));
    assert!(graph.edges["web/main.ts"].contains("web/helper.ts"));
    assert!(graph.gravity()["src/helper.rs"] > 0.0);
}
#[test]
fn unresolved_and_oversized_sources_are_partial() {
    let (root, mut config) = fixture();
    write(&root, "main.js", "import './absent.js';");
    let inventory = physical_workspace::inventory(&config);
    let graph = physical_dependencies::dependencies(&config, &inventory);
    assert_eq!(graph.status, MeasurementStatus::Partial);
    assert_eq!(graph.value.unwrap().unresolved_imports, 1);
    config.max_file_bytes = 2;
    assert_eq!(
        physical_dependencies::dependencies(&config, &inventory).status,
        MeasurementStatus::Partial
    );
}
#[test]
fn lcov_deduplicates_lines_and_branches() {
    let (root, config) = fixture();
    write(&root, "src/a.rs", "a\nb\n");
    write(&root, "coverage/lcov.info", "SF:src/a.rs\nDA:1,0\nDA:2,1\nBRDA:2,0,0,1\nend_of_record\nSF:src/a.rs\nDA:1,1\nBRDA:2,0,0,0\nend_of_record\n");
    let inventory = physical_workspace::inventory(&config);
    let measurement = physical_coverage::coverage(&config, &inventory);
    assert_eq!(measurement.status, MeasurementStatus::Measured, "{measurement:?}");
    let coverage = measurement.value.unwrap();
    assert_eq!((coverage.lines_found, coverage.lines_hit), (2, 2));
    assert_eq!((coverage.branches_found, coverage.branches_hit), (1, 1));
}
#[test]
fn changed_source_invalidates_coverage() {
    let (root, config) = fixture();
    write(&root, "src/a.rs", "a");
    write(
        &root,
        "coverage/lcov.info",
        "SF:src/a.rs\nDA:1,1\nend_of_record\n",
    );
    fs::OpenOptions::new().write(true).open(root.path().join("src/a.rs"))
        .unwrap()
        .set_modified(SystemTime::now() + Duration::from_secs(1))
        .unwrap();
    let inventory = physical_workspace::inventory(&config);
    assert_eq!(
        physical_coverage::coverage(&config, &inventory).status,
        MeasurementStatus::Stale
    );
}
#[test]
fn invalid_and_missing_reports_do_not_become_zero_coverage() {
    let (root, config) = fixture();
    let inventory = physical_workspace::inventory(&config);
    let missing = physical_coverage::coverage(&config, &inventory);
    assert_eq!(missing.status, MeasurementStatus::Missing);
    assert!(missing.value.is_none());
    write(&root, "coverage/lcov.info", "DA:1,1");
    let invalid = physical_coverage::coverage(&config, &inventory);
    assert_eq!(invalid.status, MeasurementStatus::Invalid);
    assert!(invalid.value.is_none());
}
#[test]
fn istanbul_statement_lines_are_deduplicated() {
    let (root, config) = fixture();
    write(&root, "a.js", "const a=1;");
    write(
        &root,
        "coverage/coverage-final.json",
        r#"{"a.js":{"path":"a.js","statementMap":{"0":{"start":{"line":1}},"1":{"start":{"line":1}}},"s":{"0":0,"1":1},"b":{"0":[0,1]}}}"#,
    );
    let inventory = physical_workspace::inventory(&config);
    let coverage = physical_coverage::coverage(&config, &inventory)
        .value
        .unwrap();
    assert_eq!((coverage.lines_found, coverage.lines_hit), (1, 1));
    assert_eq!((coverage.branches_found, coverage.branches_hit), (2, 1));
}
#[test]
fn expired_reports_are_rejected() {
    let (root, mut config) = fixture();
    write(&root, "a.js", "const a=1;");
    write(
        &root,
        "coverage/lcov.info",
        "SF:a.js\nDA:1,1\nend_of_record\n",
    );
    let old = SystemTime::now() - Duration::from_secs(60);
    fs::OpenOptions::new().write(true).open(root.path().join("coverage/lcov.info"))
        .unwrap()
        .set_modified(old)
        .unwrap();
    config.report_max_age = Duration::from_secs(1);
    assert_eq!(
        physical_coverage::coverage(&config, &physical_workspace::inventory(&config)).status,
        MeasurementStatus::Stale
    );
}
