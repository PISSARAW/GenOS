use genos_orchestrator::genos_biology::instinct::MotorStep;
use genos_orchestrator::genos_biology::sensory::{PheromoneSignal, PheromoneType};
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::animal_sensory_runtime::SyntheticAnimalSignal;
use genos_orchestrator::{
    planner::Goal, GenosEcosystem, InstinctActionExecutor, InstinctActionReceipt,
};
use genos_orchestrator::sensory_paf_bridge::prepare_next_synthetic_sensory_input;
use genos_orchestrator::sensory_receipt_runtime::{
    persist_synthetic_sensory_receipt, read_verified_synthetic_sensory_envelopes,
};
use serde_json::{Value, json};
use std::process::Command;
use std::path::PathBuf;
use tempfile::TempDir;
use uuid::Uuid;

const JOURNAL_ENV: &str = "GENOS_INSTINCT_PAF_JOURNAL";
const MISSION_ENV: &str = "GENOS_INSTINCT_PAF_MISSION";
const RECEIPT_ENV: &str = "GENOS_INSTINCT_PAF_RECEIPT";
const SOURCE_EVENT_ENV: &str = "GENOS_INSTINCT_PAF_SOURCE_EVENT";

struct EvidenceExecutor;

impl InstinctActionExecutor for EvidenceExecutor {
    fn execute(&mut self, step: &MotorStep) -> Result<InstinctActionReceipt, String> {
        Ok(InstinctActionReceipt {
            execution_id: format!("restart-test:{}", step.action),
            evidence_ref: format!("evidence:{}", step.action),
            result: json!({"accepted": true, "action": step.action}),
        })
    }
}

#[test]
fn action_bearing_paf_receipt_survives_process_restart() {
    if std::env::var_os(JOURNAL_ENV).is_some() {
        return;
    }

    let workspace = test_directory();
    let path = workspace.path().join("mission-receipts.jsonl");
    let mission_id = Uuid::new_v4();
    let mut ecosystem = GenosEcosystem::new("instinct-paf-process-source");
    ecosystem.set_mission_id(mission_id);
    ecosystem.set_instinct_authorized_tools(vec!["genos_biomimicry".into()]);
    ecosystem.set_instinct_action_executor(Box::new(EvidenceExecutor));
    let store = BiologicalReceiptStore::open(&path);
    let source = ecosystem
        .ingest_synthetic_animal_signal(SyntheticAnimalSignal::Vomeronasal {
            signal: PheromoneSignal {
                source_agent: "synthetic-source".into(),
                locus: "workspace/test".into(),
                pheromone_type: PheromoneType::Alarm,
                concentration: 0.9,
                half_life_secs: 60.0,
                timestamp_epoch_ms: 1,
                subliminal_payload: Default::default(),
            },
        })
        .expect("typed VNO signal is accepted");
    let mut source = serde_json::to_value(source).unwrap();
    source["execution_mode"] = json!("experimental");
    source["mission_authority"] = json!("unverified_cli_claim");
    let source_event_id = source["event_id"].as_str().unwrap().to_string();
    persist_synthetic_sensory_receipt(&store, mission_id, &source)
        .expect("source receipt is bound to the mission");
    assert!(prepare_next_synthetic_sensory_input(&mut ecosystem, &store)
        .expect("verified source is queued for PAF"));
    ecosystem
        .tick_and_persist(&Goal::Explore, &store)
        .expect("mission tick persists its PAF action evidence");
    let paf = store
        .read_all()
        .unwrap()
        .into_iter()
        .find(|receipt| receipt["schema"] == "genos.instinct-paf-receipt/v1")
        .expect("tick writes a PAF receipt");
    let receipt_id = paf["receipt_id"].as_str().unwrap().to_string();
    drop(ecosystem);
    drop(store);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "instinct_paf_restart_reader", "--nocapture"])
        .env(JOURNAL_ENV, &path)
        .env(MISSION_ENV, mission_id.to_string())
        .env(RECEIPT_ENV, receipt_id)
        .env(SOURCE_EVENT_ENV, source_event_id)
        .output()
        .unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(
        child.status.success(),
        "PAF restart reader failed: {}",
        String::from_utf8_lossy(&child.stderr)
    );
}

#[test]
fn instinct_paf_restart_reader() {
    let Ok(path) = std::env::var(JOURNAL_ENV) else {
        return;
    };
    let mission_id = std::env::var(MISSION_ENV).unwrap().parse::<Uuid>().unwrap();
    let receipt_id = std::env::var(RECEIPT_ENV).unwrap();
    let source_event_id = std::env::var(SOURCE_EVENT_ENV).unwrap();
    let store = BiologicalReceiptStore::open(path);
    let sources = read_verified_synthetic_sensory_envelopes(&store, mission_id).unwrap();
    assert_eq!(sources.len(), 1);
    assert_eq!(sources[0]["event_id"], source_event_id);
    let source_digest = sources[0]["source_digest"].as_str().unwrap();
    let receipts = store.read_all().unwrap();
    let pafs: Vec<Value> = receipts
        .into_iter()
        .filter(|receipt| {
            receipt["schema"] == "genos.instinct-paf-receipt/v1"
                && receipt["mission_id"] == mission_id.to_string()
        })
        .collect();
    assert_eq!(pafs.len(), 1);
    let recovered = &pafs[0];
    assert_eq!(recovered["receipt_id"], receipt_id);
    assert_eq!(recovered["tick"], 1);
    assert_eq!(recovered["stimuli"][0]["signature"], "threat_detected");
    assert_eq!(recovered["sensory_source_refs"][0]["event_id"], source_event_id);
    assert_eq!(recovered["sensory_source_refs"][0]["source_digest"], source_digest);
    assert_eq!(recovered["evaluation"]["released"], true);
    assert_eq!(recovered["actions"].as_array().unwrap().len(), 2);
    assert_eq!(
        recovered["actions"][0]["result"]["evidence_ref"],
        "evidence:raise_alarm"
    );
}

fn test_directory() -> TempDir {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target");
    tempfile::Builder::new()
        .prefix("instinct-paf-restart-")
        .tempdir_in(base)
        .unwrap()
}
