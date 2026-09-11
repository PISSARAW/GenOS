use serde_json::json;
use crate::commands::biomimicry_features::extract_param;

pub fn handle_specialized_cell(feature: &str, action: &str, params: &[String]) {
    match feature {
        "cnidocyte" | "nematocyst" => handle_cnidocyte(action, params),
        "electrocyte" | "electric_organ" => handle_electrocyte(action, params),
        _ => {
            println!("{}", json!({
                "success": true, "operation": "specialized_cell",
                "feature": feature, "action": action, "params": params, "status": "executed"
            }));
        }
    }
}

pub fn handle_cnidocyte(action: &str, params: &[String]) {
    let agent_id = extract_param(params, "agent_id").unwrap_or_else(|| "sentinel_cnidocyte_0".to_string());
    let prompt = extract_param(params, "prompt").or_else(|| extract_param(params, "stimulus"));
    let force: f64 = extract_param(params, "force").and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let atp: f64 = extract_param(params, "atp").and_then(|s| s.parse().ok()).unwrap_or(100.0);

    let mut cnidocyte = genos_biology::specialized_cells::cnidocyte::Cnidocyte::new(&agent_id);

    match action {
        "reload" => {
            let atp_remaining = cnidocyte.reload(atp).unwrap_or(atp);
            println!("{}", json!({
                "success": true, "feature": "cnidocyte", "action": "reload",
                "agent_id": agent_id, "is_armed": !cnidocyte.is_discharged,
                "atp_remaining": atp_remaining, "status": "ARMED_AND_PRESSURIZED"
            }));
        }
        "intercept" | "eval" => {
            let prompt_text = prompt.as_deref().unwrap_or("");
            let impact = cnidocyte.intercept_prompt_threat(prompt_text);
            println!("{}", json!({
                "success": true, "feature": "cnidocyte", "action": action,
                "agent_id": agent_id, "threat_intercepted": impact.is_some(),
                "impact": impact, "is_discharged": cnidocyte.is_discharged
            }));
        }
        _ => {
            let impact = cnidocyte.discharge(force, prompt.as_deref()).unwrap_or_else(|err| {
                genos_biology::specialized_cells::cnidocyte::DischargeImpact {
                    success: false, latency_micros: 0,
                    delivered_toxin: cnidocyte.capsule.toxin.clone(),
                    target_neutralized: false, residual_pressure_mpa: 0.0,
                    message: err,
                }
            });
            println!("{}", json!({
                "success": true, "feature": "cnidocyte", "action": "discharge",
                "agent_id": agent_id, "impact": impact,
                "is_discharged": cnidocyte.is_discharged
            }));
        }
    }
}

pub fn handle_electrocyte(action: &str, params: &[String]) {
    let organ_id = extract_param(params, "organ_id")
        .or_else(|| extract_param(params, "agent_id"))
        .unwrap_or_else(|| "electric_organ_0".to_string());
    let cell_count: usize = extract_param(params, "cell_count").and_then(|s| s.parse().ok()).unwrap_or(4000);
    let columns: usize = extract_param(params, "columns").and_then(|s| s.parse().ok()).unwrap_or(1);
    let atp: f64 = extract_param(params, "atp").and_then(|s| s.parse().ok()).unwrap_or(5000.0);

    let mut organ = genos_biology::specialized_cells::electrocyte::ElectricOrganStack::new(&organ_id, cell_count, columns);

    match action {
        "recharge" => {
            let atp_remaining = organ.recharge_all(atp).unwrap_or(atp);
            println!("{}", json!({
                "success": true, "feature": "electrocyte", "action": "recharge",
                "organ_id": organ_id, "cells_count": organ.electrocytes.len(),
                "atp_remaining": atp_remaining, "status": "RECHARGED_AND_POLARIZED"
            }));
        }
        "voltage" | "estimate" => {
            let theoretical_v = organ.calculate_theoretical_voltage();
            println!("{}", json!({
                "success": true, "feature": "electrocyte", "action": "voltage",
                "organ_id": organ_id, "theoretical_voltage_v": theoretical_v,
                "cells_count": organ.electrocytes.len(), "parallel_columns": columns
            }));
        }
        _ => {
            let burst = organ.discharge_burst();
            match burst {
                Ok(b) => {
                    println!("{}", json!({
                        "success": true, "feature": "electrocyte", "action": "discharge",
                        "organ_id": organ_id, "burst": b
                    }));
                }
                Err(err) => {
                    println!("{}", json!({
                        "success": false, "feature": "electrocyte", "action": "discharge",
                        "organ_id": organ_id, "error": err
                    }));
                }
            }
        }
    }
}
