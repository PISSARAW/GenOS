use genos_orchestrator::{GenosEcosystem, Goal, genos_cell::AgentCell, genos_store::BiologicalReceiptStore};
use uuid::Uuid;

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let path = args.get(1).ok_or("journal required")?;
    let mission: Uuid = args.get(2).ok_or("mission required")?.parse().map_err(|e: uuid::Error| e.to_string())?;
    let store = BiologicalReceiptStore::open(path);
    let mut ecosystem = GenosEcosystem::new("receipt-bridge");
    ecosystem.set_mission_id(mission);
    initialize_population(&mut ecosystem, &store)?;
    ecosystem.configure_receipt_journal(path);
    ecosystem.feed(100.0);
    execute_mode(&mut ecosystem, &store, &args)?;
    println!("{}", ecosystem.population_state_receipt(0)?);
    Ok(())
}

fn initialize_population(ecosystem: &mut GenosEcosystem, store: &BiologicalReceiptStore) -> Result<(), String> {
    if !store.read_all()?.is_empty() { return ecosystem.restore_population(store); }
    ecosystem.orchestrator.create_tissue("Exec", "Worker")?;
    let cell = ecosystem.orchestrator.add_worker("Exec", AgentCell::new("durable", "worker", "Soma"))?;
    ecosystem.seed_germline(cell, "RECEIPT_BRIDGE")?;
    Ok(())
}

fn execute_mode(ecosystem: &mut GenosEcosystem, store: &BiologicalReceiptStore, args: &[String]) -> Result<(), String> {
    if args.get(3).map(String::as_str).unwrap_or("tick") == "flush" { ecosystem.flush_receipt_journal(store)?; }
    else if args.get(3).map(String::as_str).unwrap_or("tick") == "therapy" {
        let auth_path = args.get(4).ok_or("authorization file required")?;
        let auth = serde_json::from_slice(&std::fs::read(auth_path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        ecosystem.apply_authorized_therapy(&auth, store)?;
    }
    else {
        let report = ecosystem.tick(&Goal::SecurePerimeter);
        if let Some(reason) = report.halt { return Err(reason); }
    }
    Ok(())
}
