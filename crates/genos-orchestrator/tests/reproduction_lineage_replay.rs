use genos_orchestrator::GenosEcosystem;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[test]
fn mission_reproduction_lineage_replays_from_reopened_journal() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-reproduction-replay-{nonce}.jsonl"));
    let mission_id = Uuid::new_v4();
    let store = BiologicalReceiptStore::open(&path);
    let mut source = GenosEcosystem::new("reproduction-source");
    source.set_mission_id(mission_id);
    let founder = source.orchestrator.orchestrator_id;
    source.seed_germline(founder, "durable reproduction founder").unwrap();
    source.feed(1_000.0);

    let first = source.reproduce_and_archive_lineage(&store).unwrap();
    let second = source.reproduce_and_archive_lineage(&store).unwrap();
    assert_eq!(first.mission_id, mission_id);
    assert_eq!(second.parent_genome.generation + 1, second.daughter_genome.generation);

    drop(store);
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "replay_child_process", "--nocapture"])
        .env("GENOS_REPRODUCTION_JOURNAL", &path)
        .env("GENOS_REPRODUCTION_MISSION", mission_id.to_string())
        .output().unwrap();
    assert!(child.status.success(), "restart replay failed: {}", String::from_utf8_lossy(&child.stderr));
    std::fs::remove_file(path).unwrap();
}

#[test]
fn failed_receipt_append_rolls_back_birth_and_energy() {
    let missing_parent = std::env::temp_dir().join(format!(
        "genos-reproduction-missing-{}",
        Uuid::new_v4()
    ));
    let path = missing_parent.join("receipt.jsonl");
    let store = BiologicalReceiptStore::open(path);
    let mut source = GenosEcosystem::new("reproduction-rollback");
    source.set_mission_id(Uuid::new_v4());
    let founder = source.orchestrator.orchestrator_id;
    source.seed_germline(founder, "reproduction rollback founder").unwrap();
    source.feed(1_000.0);
    let cells_before = source.orchestrator.active_cells.len();
    let genomes_before = source.orchestrator.genomes.len();
    let atp_before = source.atp();
    let events_before = source.events.count();

    assert!(source.reproduce_and_archive_lineage(&store).is_err());
    assert_eq!(source.orchestrator.active_cells.len(), cells_before);
    assert_eq!(source.orchestrator.genomes.len(), genomes_before);
    assert_eq!(source.atp(), atp_before);
    assert_eq!(source.events.count(), events_before);
    assert!(store.read_all().unwrap().is_empty());
    assert!(!missing_parent.exists());
}

#[test]
fn replay_child_process() {
    let Ok(path) = std::env::var("GENOS_REPRODUCTION_JOURNAL") else { return; };
    let mission_id = std::env::var("GENOS_REPRODUCTION_MISSION").unwrap().parse::<Uuid>().unwrap();
    let reopened = BiologicalReceiptStore::open(path);
    let mut recovered = GenosEcosystem::new("reproduction-recovered");
    recovered.set_mission_id(mission_id);
    let summary = recovered.replay_reproduction_lineage(&reopened).unwrap();
    assert_eq!(summary.receipts_replayed, 2);
    assert_eq!(summary.cells_recovered, 3);
    assert_eq!(summary.genomes_recovered, 3);
    assert_eq!(recovered.orchestrator.active_cells.len(), 3);
    assert_eq!(recovered.orchestrator.genomes.len(), 3);
}
