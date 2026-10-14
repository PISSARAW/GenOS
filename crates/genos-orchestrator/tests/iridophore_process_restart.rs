use genos_biology::ObserverPerspective;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::{iridophore_receipt::read_iridophore_receipts, GenosEcosystem};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[test]
fn perspective_render_survives_process_restart() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-iridophore-{nonce}.jsonl"));
    let mission_id = Uuid::new_v4();
    let expected = {
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("iridophore-process-source");
        ecosystem.set_mission_id(mission_id);
        ecosystem.render_polymorphic_and_persist(
            "visible payload",
            &ObserverPerspective::StructuredJson,
            &store,
        ).unwrap()
    };

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "iridophore_restart_child_process", "--nocapture"])
        .env("GENOS_IRIDOPHORE_JOURNAL", &path)
        .env("GENOS_IRIDOPHORE_MISSION", mission_id.to_string())
        .env("GENOS_IRIDOPHORE_DIGEST", expected["renderSha256"].as_str().unwrap())
        .output()
        .unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(child.status.success(), "Iridophore process recovery failed: {}", String::from_utf8_lossy(&child.stderr));
}

#[test]
fn iridophore_restart_child_process() {
    let Ok(path) = std::env::var("GENOS_IRIDOPHORE_JOURNAL") else { return; };
    let mission_id = std::env::var("GENOS_IRIDOPHORE_MISSION").unwrap().parse::<Uuid>().unwrap();
    let expected_digest = std::env::var("GENOS_IRIDOPHORE_DIGEST").unwrap();
    let reopened = BiologicalReceiptStore::open(path);
    let receipts = read_iridophore_receipts(&reopened, mission_id).unwrap();
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0]["perspective"], "StructuredJson");
    assert_eq!(receipts[0]["renderSha256"], expected_digest);
    assert_eq!(receipts[0]["camouflageIsCryptographic"], false);
    let rendered = receipts[0]["rendered"].as_str().unwrap();
    let parsed: serde_json::Value = serde_json::from_str(rendered).unwrap();
    assert_eq!(parsed["payload"], "visible payload");
}
