use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use std::process::Command;
use uuid::Uuid;

#[test]
fn first_cli_tick_after_process_restart_uses_journal_spore_population() {
    let root = std::env::temp_dir().join(format!("genos-spore-startup-{}", Uuid::new_v4()));
    let receipts = root.join("biological-receipts");
    std::fs::create_dir_all(&receipts).unwrap();
    let mission_id = Uuid::new_v4();
    let store = BiologicalReceiptStore::open(receipts.join(format!("{mission_id}.jsonl")));

    let mut source = GenosEcosystem::new("spore-startup-source");
    source.set_mission_id(mission_id);
    source.orchestrator.create_tissue("Archive", "Dormant worker").unwrap();
    let cell = source
        .orchestrator
        .add_worker("Archive", AgentCell::new("archived", "dormant", "Soma"))
        .unwrap();
    let genome_id = source.seed_germline(cell, "CLI_SPORE_STARTUP").unwrap();
    let lineage_id = source.orchestrator.genomes[&genome_id].lineage_id();
    source
        .orchestrator
        .sporulate_cell(cell, SporeType::BacterialEndospore)
        .unwrap();
    store.append_receipts(&[source.population_state_receipt(17).unwrap()]).unwrap();
    drop(source);

    let mission_arg = mission_id.to_string();
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &mission_arg,
            "--mission", "resume spore population",
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let response: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(response["tick"], 18, "the first tick must continue from the restored cursor");
    let population = response["receipts"].as_array().unwrap().iter()
        .find(|receipt| receipt["schema"] == "genos.population-state/v1")
        .expect("first tick should report its durable population snapshot");
    let spore = &population["dormant_spores"][0];
    assert_eq!(spore["genome_id"], genome_id.to_string());
    assert_eq!(spore["lineage_id"], lineage_id.to_string());
    assert_eq!(spore["spore_type"], "BacterialEndospore");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn cli_startup_fails_closed_on_population_journal_mission_mismatch() {
    let root = std::env::temp_dir().join(format!("genos-spore-mismatch-{}", Uuid::new_v4()));
    let receipts = root.join("biological-receipts");
    std::fs::create_dir_all(&receipts).unwrap();
    let requested_mission = Uuid::new_v4();
    let mut source = GenosEcosystem::new("spore-mismatch-source");
    source.set_mission_id(Uuid::new_v4());
    let store = BiologicalReceiptStore::open(receipts.join(format!("{requested_mission}.jsonl")));
    store.append_receipts(&[source.population_state_receipt(2).unwrap()]).unwrap();

    let mission_arg = requested_mission.to_string();
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &mission_arg,
            "--mission", "reject mismatched spore journal",
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("population mission mismatch"),
        "unexpected CLI error: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let _ = std::fs::remove_dir_all(root);
}
