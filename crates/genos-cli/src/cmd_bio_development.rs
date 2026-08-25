use anyhow::{bail, Result};
use genos_core::biomimicry::{Embryogenesis, EmbryoPhase, HoxBlueprint, BodySegment};

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

pub fn hox_verify(params: &[String]) -> Result<()> {
    let mut blueprint = HoxBlueprint::new();
    // Default blueprint construction for the sake of the CLI
    blueprint.add_gene("identity".to_string(), BodySegment::Anterior, 1);
    blueprint.add_gene("reasoning".to_string(), BodySegment::Thorax, 1);
    blueprint.add_gene("mcp_tools".to_string(), BodySegment::Posterior, 1);
    
    let activated: Vec<String> = params
        .iter()
        .filter_map(|p| p.strip_prefix("activated=").map(|s| s.to_string()))
        .collect();

    if activated.is_empty() {
        bail!("Missing --param activated=<capability>");
    }

    match blueprint.verify_colinearity(&activated) {
        Ok(_) => {
            println!("Hox colinearity verified. Capabilities activated in correct biological order.");
            Ok(())
        },
        Err(e) => bail!("Hox colinearity violation: {}", e),
    }
}
