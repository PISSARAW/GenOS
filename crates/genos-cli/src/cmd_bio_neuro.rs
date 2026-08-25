use anyhow::{bail, Result};
use genos_core::biomimicry::{EndocrineSystem, Hormone};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn endocrine_modulate(params: &[String]) -> Result<()> {
    let swarm_id = param_value(params, "swarm_id")
        .unwrap_or("global_swarm")
        .to_string();
    let action = param_value(params, "endocrine_action")
        .ok_or_else(|| anyhow::anyhow!("missing --param endocrine_action=<secrete|decay>"))?;

    let mut system = EndocrineSystem::new(swarm_id.clone());

    if action == "secrete" {
        let hormone_str = param_value(params, "hormone")
            .ok_or_else(|| anyhow::anyhow!("missing --param hormone=<name>"))?;
        let amount: f64 = param_value(params, "amount")
            .unwrap_or("0.5")
            .parse()?;
            
        let hormone = Hormone::parse(hormone_str);
        system.secrete(hormone.clone(), amount);
        println!("Secreted {} of {:?}. Swarm {} modulated.", amount, hormone, swarm_id);
    } else if action == "decay" {
        let factor: f64 = param_value(params, "decay_factor")
            .unwrap_or("0.1")
            .parse()?;
        system.decay(factor);
        println!("Applied decay factor {} to endocrine system of swarm {}.", factor, swarm_id);
    } else {
        bail!("Unknown endocrine action: {}", action);
    }
    
    Ok(())
}
