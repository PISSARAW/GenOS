use genos_orchestrator::{GenosEcosystem, Goal, genos_cell::AgentCell, genos_store::BiologicalReceiptStore};
use uuid::Uuid;

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let path = args.get(1).ok_or("journal required")?;
    let mission: Uuid = args.get(2).ok_or("mission required")?.parse().map_err(|e: uuid::Error| e.to_string())?;
    let mode = args.get(3).map(String::as_str).unwrap_or("tick");
    let store = BiologicalReceiptStore::open(path);
    let mut ecosystem = GenosEcosystem::new("receipt-bridge");
    ecosystem.set_mission_id(mission);
    initialize_population(&mut ecosystem, &store)?;
    ecosystem.configure_receipt_journal(path);
    ecosystem.feed(100.0);
    if mode == "flush" { ecosystem.flush_receipt_journal(&store)?; }
    else {
        let report = ecosystem.tick(&Goal::SecurePerimeter);
        if let Some(reason) = report.halt { return Err(reason); }
    }
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
