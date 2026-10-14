use genos_dna::{compile, manifest::Manifest, model::EpiMark};
use genos_orchestrator::epigenetic_recruitment_recovery::EpigeneticRecruitmentRequest;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::{Demand, GenosEcosystem};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const JOURNAL_ENV: &str = "GENOS_EPIGENETIC_RECRUITMENT_JOURNAL";
const MISSION_ENV: &str = "GENOS_EPIGENETIC_RECRUITMENT_MISSION";
const RECEIPT_ENV: &str = "GENOS_EPIGENETIC_RECRUITMENT_RECEIPT";

#[test]
fn role_methylation_recruitment_restores_and_replays_in_child_process() {
    if std::env::var_os(JOURNAL_ENV).is_some() {
        return;
    }
    let path = journal_path();
    let mission = Uuid::new_v4();
    let mut dna = candidate_dna();
    dna.epigenome.marks.insert("ROLE".into(), EpiMark {
        kind: "Methylation".into(),
        level: 1.0,
    });
    let demand = Demand {
        roles: vec!["historian".into()],
        capabilities: Vec::new(),
        budget: 10.0,
    };
    let store = BiologicalReceiptStore::open(&path);
    let mut source = GenosEcosystem::new("epigenetic-recruitment-source");
    source.set_mission_id(mission);
    let decision = source.recruit_dna_for_mission(EpigeneticRecruitmentRequest {
        store: &store,
        tissue: "Archive",
        demand: &demand,
        candidates: &[(&dna, 1.0)],
        tick: 29,
    }).unwrap();
    assert!(!decision.feasible);
    let receipt = store.read_all().unwrap().into_iter()
        .find(|entry| entry["schema"] == "genos.epigenetic-recruitment-receipt/v1")
        .unwrap();
    let receipt_id = receipt["receipt_id"].as_str().unwrap().to_string();
    drop(source);
    drop(store);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "epigenetic_recruitment_child_process", "--nocapture"])
        .env(JOURNAL_ENV, &path)
        .env(MISSION_ENV, mission.to_string())
        .env(RECEIPT_ENV, receipt_id)
        .output().unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(child.status.success(), "epigenetic process recovery failed: {}",
        String::from_utf8_lossy(&child.stderr));
}

#[test]
fn epigenetic_recruitment_child_process() {
    let Ok(path) = std::env::var(JOURNAL_ENV) else { return; };
    let mission = std::env::var(MISSION_ENV).unwrap().parse::<Uuid>().unwrap();
    let receipt_id = std::env::var(RECEIPT_ENV).unwrap();
    let store = BiologicalReceiptStore::open(path);
    let mut restored = GenosEcosystem::new("epigenetic-recruitment-restarted");
    restored.set_mission_id(mission);
    let receipt = restored.restore_epigenetic_recruitment(&store).unwrap();

    assert_eq!(receipt["receipt_id"], receipt_id);
    assert_eq!(receipt["mission_id"], mission.to_string());
    assert_eq!(receipt["tick"], 29);
    assert_eq!(receipt["decision"]["feasible"], false);
    assert_eq!(receipt["recruited_cells"].as_array().unwrap().len(), 0);
    assert_eq!(receipt["expressions"].as_array().unwrap().len(), 1);
    assert_ne!(receipt["expressions"][0]["phenotype_role"], "historian");
    assert_eq!(restored.receipt_tick, 29);
}

fn candidate_dna() -> genos_dna::AgentDna {
    let manifest: Manifest = serde_json::from_str(
        r#"{
            "apiVersion": "v0alpha1",
            "kind": "AgentGenome",
            "metadata": { "name": "EvidenceLedger", "version": "0.1.0" },
            "identity": { "role": "historian", "name": "EvidenceLedger", "name_meaning": "preuve" },
            "objectives": { "primary": "archiver", "source_doc": "docs/README.md" },
            "capabilities": [],
            "tool_policy": { "allowed_tools": [] }
        }"#,
    ).expect("manifest");
    compile::compile_manifest(&manifest).expect("DNA compilé")
}

fn journal_path() -> std::path::PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-epigenetic-recruitment-{nonce}.jsonl"))
}
