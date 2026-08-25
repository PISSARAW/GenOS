use anyhow::{bail, Result};
use genos_core::biomimicry::{Embryogenesis, EmbryoPhase};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn embryogenesis_advance(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param agent_id=<id>"))?
        .to_string();
    let current = param_value(params, "current_phase")
        .ok_or_else(|| anyhow::anyhow!("missing --param current_phase=<phase>"))?;
    let phase = EmbryoPhase::parse(current)
        .ok_or_else(|| anyhow::anyhow!("invalid phase: {}", current))?;
        
    let preconditions = param_value(params, "preconditions_met")
        .unwrap_or("false") == "true";

    let mut embryo = Embryogenesis { agent_id: agent_id.clone(), current_phase: phase };
    match embryo.advance(preconditions) {
        Ok(next_phase) => {
            println!("Agent {} advanced to phase {:?}", agent_id, next_phase);
            Ok(())
        },
        Err(e) => bail!("Failed to advance: {}", e),
    }
}
