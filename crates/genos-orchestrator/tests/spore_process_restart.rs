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
    let reopened = BiologicalReceiptStore::open(path);
    let mut recovered = GenosEcosystem::new("spore-process-recovered");
    recovered.set_mission_id(mission_id);
    recovered.restore_population(&reopened).unwrap();

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
