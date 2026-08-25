use anyhow::{bail, Result};
use genos_core::biomimicry::{AutopoiesisEngine, SenescenceMonitor};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn theory_autopoiesis(params: &[String]) -> Result<()> {
    let swarm_id = param_value(params, "swarm_id").unwrap_or("swarm_alpha").to_string();
    let compute: u64 = param_value(params, "compute_budget").unwrap_or("1500").parse()?;
    let error: f64 = param_value(params, "error_rate").unwrap_or("0.1").parse()?;
    
    let mut ae = AutopoiesisEngine::new(swarm_id);
    println!("{}", ae.maintain_self(compute, error));
    Ok(())
}

pub fn lifecycle_senescence(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id").unwrap_or("agent_alpha").to_string();
    let max_epochs: usize = param_value(params, "max_epochs").unwrap_or("10").parse()?;
    let current_epoch: usize = param_value(params, "current_epoch").unwrap_or("11").parse()?;
    
    let mut sm = SenescenceMonitor::new(agent_id, max_epochs);
    sm.epochs_active = current_epoch - 1; // mock
    println!("{}", sm.check_age());
    Ok(())
}
