use anyhow::{bail, Result};
use genos_core::biomimicry::{AutoImmunityRegulator, InflammatoryResponse};

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params
        .iter()
        .find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn immuno_inflammation(params: &[String]) -> Result<()> {
    let swarm_id = param_value(params, "swarm_id")
        .unwrap_or("global_swarm")
        .to_string();
    let action = param_value(params, "action").ok_or_else(|| anyhow::anyhow!("missing action"))?;

    let mut response = InflammatoryResponse::new(swarm_id.clone());

    if action == "trigger" {
        let threat: f64 = param_value(params, "threat_level")
            .unwrap_or("0.5")
            .parse()?;
        response.trigger_response(threat);
        println!(
            "Inflammation evaluated for Swarm {}. Severity: {:.2}, State: {:?}",
            swarm_id, response.severity, response.state
        );
        if response.is_quarantined() {
            println!("QUARANTINE ENFORCED: Degraded mode active.");
        }
    } else if action == "resolve" {
        let rate: f64 = param_value(params, "recovery_rate")
            .unwrap_or("0.2")
            .parse()?;
        // Mocking severity for resolution
        response.severity = 0.9;
        response.resolve_over_time(rate);
        println!(
            "Inflammation cooling down. New severity: {:.2}, State: {:?}",
            response.severity, response.state
        );
    } else {
        bail!("Unknown inflammation action");
    }

    Ok(())
}

pub fn immuno_autoimmunity(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id")
        .unwrap_or("agent_alpha")
        .to_string();
    let threshold: usize = param_value(params, "threshold").unwrap_or("3").parse()?;
    let action = param_value(params, "action").ok_or_else(|| anyhow::anyhow!("missing action"))?;

    let mut regulator = AutoImmunityRegulator::new(agent_id.clone(), threshold);

    if action == "log_kill" {
        regulator.log_defensive_action();
        println!(
            "Defensive kill logged. Total recent kills: {}",
            regulator.recent_defensive_kills
        );
    } else if action == "evaluate" {
        // Mock kills
        regulator.recent_defensive_kills =
            param_value(params, "recent_kills").unwrap_or("4").parse()?;
        if regulator.is_autoimmune_overreaction() {
            println!("AUTOIMMUNE OVERREACTION DETECTED! Suppressing defensive modules (Regulatory T-cell activation).");
            regulator.suppress_immune_response();
        } else {
            println!("Immune response normal. No suppression needed.");
        }
    } else {
        bail!("Unknown autoimmunity action");
    }

    Ok(())
}
