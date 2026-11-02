use genos_orchestrator::mission_protocols::{WorkerJob, integer};
use std::io::Read;

pub fn execute() -> Result<(), String> {
    let mut bytes = Vec::new();
    std::io::stdin().take(262145).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() > 262144 { return Err("native worker input too large".into()); }
    let job: WorkerJob = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    let result = integer::execute(&job)?;
    println!("{}", serde_json::to_string(&result).map_err(|e| e.to_string())?);
    Ok(())
}
