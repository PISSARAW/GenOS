use genos_cell::AgentCell;
use genos_orchestrator::mission_crossover::{CrossoverReceipt, CrossoverRequest};
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const JOURNAL_ENV: &str = "GENOS_CROSSOVER_JOURNAL";
const EXPECTED_ENV: &str = "GENOS_CROSSOVER_EXPECTED";

#[test]
fn crossover_receipt_replays_in_a_distinct_process() {
    if std::env::var_os(JOURNAL_ENV).is_some() {
        return;
    }

    let path = journal_path();
    let mission_id = Uuid::new_v4();
    let store = BiologicalReceiptStore::open(&path);
    let mut source = GenosEcosystem::new("crossover-process-source");
    source.set_mission_id(mission_id);
    source.orchestrator.create_tissue("Arena", "Reproduction").unwrap();
    let parent_a_cell_id = source.orchestrator.orchestrator_id;
    source.seed_germline(parent_a_cell_id, "parent A").unwrap();
    let parent_b_cell_id = source.orchestrator.add_worker(
        "Arena",
        AgentCell::new("B", "parent B", "cell"),
    ).unwrap();
    source.seed_germline(parent_b_cell_id, "parent B").unwrap();

    let receipt = source.crossover_for_mission(
        CrossoverRequest { parent_a_cell_id, parent_b_cell_id, seed: 941 },
        &store,
    ).unwrap();
    let expected = serde_json::to_string(&receipt).unwrap();
    drop(store);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "crossover_child_process_entrypoint", "--nocapture"])
        .env(JOURNAL_ENV, &path)
        .env(EXPECTED_ENV, expected)
        .output().unwrap();
    assert!(
        child.status.success(),
        "crossover process restart failed: {}",
        String::from_utf8_lossy(&child.stderr),
    );
    std::fs::remove_file(path).unwrap();
}

fn replay_in_child_process() {
    let path = std::env::var(JOURNAL_ENV).unwrap();
    let expected: CrossoverReceipt = serde_json::from_str(
        &std::env::var(EXPECTED_ENV).unwrap(),
    ).unwrap();
    let store = BiologicalReceiptStore::open(path);
    let mut restored = GenosEcosystem::new("crossover-process-restart");
    restored.set_mission_id(expected.mission_id);
    let replayed = restored.replay_crossover_for_mission(&expected.idempotency_key, &store).unwrap();

    assert_eq!(replayed.mission_id, expected.mission_id);
    assert_eq!(replayed.seed, expected.seed);
    assert_eq!(replayed.parent_a.fingerprint, expected.parent_a.fingerprint);
    assert_eq!(replayed.parent_b.fingerprint, expected.parent_b.fingerprint);
    assert_eq!(replayed.child_fingerprint, expected.child_fingerprint);
    assert!(restored.orchestrator.active_cells.contains_key(&replayed.child_cell.cell_id));
}

fn journal_path() -> std::path::PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-crossover-process-{nonce}.jsonl"))
}

#[test]
fn crossover_child_process_entrypoint() {
    if std::env::var_os(JOURNAL_ENV).is_some() {
        replay_in_child_process();
    }
}
