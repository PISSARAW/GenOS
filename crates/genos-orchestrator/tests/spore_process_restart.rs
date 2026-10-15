use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[test]
fn dormant_spore_survives_process_restart_and_germinates() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-spore-process-{nonce}.jsonl"));
    let mission_id = Uuid::new_v4();
    let mut source = GenosEcosystem::new("spore-process-source");
    source.set_mission_id(mission_id);
    source.orchestrator.create_tissue("Tissue", "Worker").unwrap();
    let cell = source
        .orchestrator
        .add_worker("Tissue", AgentCell::new("spore", "w", "Soma"))
        .unwrap();
    let genome_id = source.seed_germline(cell, "PROCESS_RESTART_SPORE").unwrap();
    let lineage_id = source.orchestrator.genomes[&genome_id].lineage_id();
    source
        .orchestrator
        .sporulate_cell(cell, SporeType::BacterialEndospore)
        .unwrap();
    let snapshot = source.population_state_receipt(12).unwrap();
    BiologicalReceiptStore::open(&path)
        .append_receipts(&[snapshot])
        .unwrap();
    drop(source);

    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "spore_restart_child_process", "--nocapture"])
        .env("GENOS_SPORE_JOURNAL", &path)
        .env("GENOS_SPORE_MISSION", mission_id.to_string())
        .env("GENOS_SPORE_CELL", cell.to_string())
        .env("GENOS_SPORE_GENOME", genome_id.to_string())
        .env("GENOS_SPORE_LINEAGE", lineage_id.to_string())
        .output()
        .unwrap();
    let _ = std::fs::remove_file(&path);
    assert!(
        child.status.success(),
        "process-restart spore recovery failed: {}",
        String::from_utf8_lossy(&child.stderr)
    );
}

#[test]
fn spore_restart_child_process() {
    let Ok(path) = std::env::var("GENOS_SPORE_JOURNAL") else {
        return;
    };
    let mission_id = std::env::var("GENOS_SPORE_MISSION")
        .unwrap()
        .parse::<Uuid>()
        .unwrap();
    let cell = std::env::var("GENOS_SPORE_CELL")
        .unwrap()
        .parse::<Uuid>()
        .unwrap();
    let genome_id = std::env::var("GENOS_SPORE_GENOME")
        .unwrap()
        .parse::<Uuid>()
        .unwrap();
    let lineage_id = std::env::var("GENOS_SPORE_LINEAGE")
        .unwrap()
        .parse::<Uuid>()
        .unwrap();
    let mut recovered = GenosEcosystem::new("spore-process-recovered");
    recovered.configure_receipt_journal(path);
    recovered.resume_mission_from_journal(mission_id).unwrap();

    assert_eq!(recovered.receipt_tick, 12);
    assert_eq!(recovered.orchestrator.dormant_spores.len(), 1);
    let spore = &recovered.orchestrator.dormant_spores[0];
    assert_eq!(spore.spore_type, SporeType::BacterialEndospore);
    assert_eq!(spore.genome.genome_id(), genome_id);
    assert_eq!(spore.genome.lineage_id(), lineage_id);
    assert_eq!(
        recovered.orchestrator.spore_tissue_map.get(&cell).map(String::as_str),
        Some("Tissue")
    );
    let revived = recovered.orchestrator.germinate_spore(0, (true, true)).unwrap();
    assert_eq!(revived.cell_id, cell);
    assert_eq!(revived.genome_id, Some(genome_id));
}

#[test]
fn mission_resume_rejects_wrong_mission_without_mutating_runtime() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-spore-wrong-mission-{nonce}.jsonl"));
    let mission_id = Uuid::new_v4();
    let mut source = GenosEcosystem::new("spore-resume-source");
    source.set_mission_id(mission_id);
    source.orchestrator.create_tissue("Tissue", "Worker").unwrap();
    let cell = source
        .orchestrator
        .add_worker("Tissue", AgentCell::new("spore", "w", "Soma"))
        .unwrap();
    source
        .seed_germline(cell, "SPORE_WRONG_MISSION")
        .unwrap();
    source
        .orchestrator
        .sporulate_cell(cell, SporeType::BacterialEndospore)
        .unwrap();
    BiologicalReceiptStore::open(&path)
        .append_receipts(&[source.population_state_receipt(4).unwrap()])
        .unwrap();

    let mut resumed = GenosEcosystem::new("spore-resume-target");
    resumed.configure_receipt_journal(&path);
    let original_cells = resumed.orchestrator.active_cells.keys().copied().collect::<std::collections::HashSet<_>>();
    assert!(resumed.resume_mission_from_journal(Uuid::new_v4()).is_err());
    assert_eq!(resumed.mission_id, None);
    assert_eq!(resumed.receipt_tick, 0);
    assert_eq!(resumed.orchestrator.active_cells.keys().copied().collect::<std::collections::HashSet<_>>(), original_cells);
    assert!(resumed.orchestrator.dormant_spores.is_empty());
    let _ = std::fs::remove_file(path);
}

#[test]
fn mission_resume_selects_its_snapshot_and_restores_worker_tissue_membership() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-population-missions-{nonce}.jsonl"));
    let first_mission = Uuid::new_v4();
    let second_mission = Uuid::new_v4();
    let mut first = GenosEcosystem::new("first-mission");
    first.set_mission_id(first_mission);
    first.orchestrator.create_tissue("analysis", "worker team").unwrap();
    let worker = first.orchestrator.add_worker("analysis", AgentCell::new("analysis-worker", "w", "Soma")).unwrap();
    let first_snapshot = first.population_state_receipt(4).unwrap();
    let mut second = GenosEcosystem::new("second-mission");
    second.set_mission_id(second_mission);
    let second_snapshot = second.population_state_receipt(9).unwrap();
    BiologicalReceiptStore::open(&path).append_receipts(&[first_snapshot, second_snapshot]).unwrap();

    let mut resumed = GenosEcosystem::new("resumed-first-mission");
    resumed.configure_receipt_journal(&path);
    resumed.resume_mission_from_journal(first_mission).unwrap();
    assert_eq!(resumed.receipt_tick, 4);
    assert_eq!(resumed.orchestrator.owning_tissue(worker).as_deref(), Some("analysis"));
    assert!(resumed.orchestrator.delegate_task("analysis", (worker, "review evidence")).is_ok());
    let _ = std::fs::remove_file(path);
}

#[test]
fn legacy_population_snapshot_recovers_root_identity_and_tissue_membership() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-population-legacy-{nonce}.jsonl"));
    let mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("legacy-source");
    source.set_mission_id(mission);
    let root_id = source.orchestrator.orchestrator_id;
    source.orchestrator.create_tissue("review", "legacy team").unwrap();
    let worker = source.orchestrator.add_worker("review", AgentCell::new("reviewer", "w", "Soma")).unwrap();
    let mut snapshot = source.population_state_receipt(3).unwrap();
    snapshot.as_object_mut().unwrap().remove("orchestrator_id");
    snapshot.as_object_mut().unwrap().remove("tissues");
    BiologicalReceiptStore::open(&path).append_receipts(&[snapshot]).unwrap();

    let mut resumed = GenosEcosystem::new("legacy-resumed");
    resumed.configure_receipt_journal(&path);
    resumed.resume_mission_from_journal(mission).unwrap();
    assert_eq!(resumed.orchestrator.orchestrator_id, root_id);
    assert_eq!(resumed.orchestrator.owning_tissue(worker).as_deref(), Some("review"));
    assert!(resumed.orchestrator.delegate_task("review", (worker, "inspect")).is_ok());
    let _ = std::fs::remove_file(path);
}

#[test]
fn mission_resume_fails_closed_when_journal_has_no_population_snapshot() {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("genos-spore-empty-journal-{nonce}.jsonl"));
    let mut resumed = GenosEcosystem::new("spore-resume-empty");
    resumed.configure_receipt_journal(&path);

    assert!(resumed.resume_mission_from_journal(Uuid::new_v4()).is_err());
    assert_eq!(resumed.mission_id, None);
    assert_eq!(resumed.receipt_tick, 0);
    assert!(resumed.orchestrator.dormant_spores.is_empty());
    let _ = std::fs::remove_file(path);
}
