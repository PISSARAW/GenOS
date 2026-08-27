use anyhow::{bail, Result};
use genos_core::biomimicry::{BloodBrainBarrier, EndosymbiosisEngine, OrganelleStatus};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params
        .iter()
        .find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn cellular_endosymbiosis(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .unwrap_or("agent_alpha")
        .to_string();
    let external_tool = param_value(params, "external_tool")
        .ok_or_else(|| anyhow::anyhow!("missing external_tool"))?
        .to_string();
    let success_rate: f64 = param_value(params, "success_rate")
        .unwrap_or("0.9")
        .parse()?;

    let mut engine = EndosymbiosisEngine::new(agent_id, external_tool);
    println!("{}", engine.engulf_tool(success_rate));

    Ok(())
}

pub fn cellular_bbb(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .unwrap_or("agent_alpha")
        .to_string();
    let strict_mode_str = param_value(params, "strict_mode").unwrap_or("true");
    let strict_mode = strict_mode_str == "true";
    let risk_score: f64 = param_value(params, "risk_score").unwrap_or("0.5").parse()?;

    let payload = "Unstructured data from web scraping or API...";

    let bbb = BloodBrainBarrier::new(agent_id, strict_mode);
    match bbb.filter_payload(payload, risk_score) {
        Ok(msg) => println!("{}", msg),
        Err(e) => println!("ERROR: {}", e),
    }

    Ok(())
}
