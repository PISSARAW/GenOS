use anyhow::{bail, Result};
use genos_core::biomimicry::{SeedDormancy, AbscissionProcess};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn plant_seed(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id").unwrap_or("agent_alpha").to_string();
    let action = param_value(params, "action").ok_or_else(|| anyhow::anyhow!("missing action"))?;
    
    let mut seed = SeedDormancy::new(agent_id.clone());
    
    if action == "pack" {
        let condition = param_value(params, "condition").unwrap_or("cpu_idle");
        println!("{}", seed.enter_dormancy(condition));
    } else if action == "check" {
        let env = param_value(params, "environment").unwrap_or("cpu_heavy");
        // Mocking state
        seed.state = genos_core::biomimicry::SeedState::Dormant;
        seed.germination_condition = param_value(params, "condition").unwrap_or("cpu_idle").to_string();
        println!("{}", seed.check_germination(env));
    } else {
        bail!("Unknown seed action");
    }
    
    Ok(())
}

pub fn plant_abscission(params: &[String]) -> Result<()> {
    let swarm_id = param_value(params, "swarm_id").unwrap_or("swarm_alpha").to_string();
    let target = param_value(params, "target_module").ok_or_else(|| anyhow::anyhow!("missing target_module"))?;
    let reclaim: u64 = param_value(params, "reclaim_budget").unwrap_or("150").parse()?;
    
    let abscission = AbscissionProcess::new(swarm_id);
    println!("{}", abscission.sever_module(target, reclaim));
    
    Ok(())
}
