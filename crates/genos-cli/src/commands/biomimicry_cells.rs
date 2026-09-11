use serde_json::json;
use crate::commands::biomimicry_features::extract_param;

pub fn handle_specialized_cell(feature: &str, action: &str, params: &[String]) {
    match feature {
        "cnidocyte" | "nematocyst" => handle_cnidocyte(action, params),
        "electrocyte" | "electric_organ" => handle_electrocyte(action, params),
        "choanocyte" | "collar_cell" => handle_choanocyte(action, params),
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

pub fn handle_choanocyte(action: &str, params: &[String]) {
    let chamber_id = extract_param(params, "chamber_id")
        .or_else(|| extract_param(params, "agent_id"))
        .unwrap_or_else(|| "choano_chamber_0".to_string());
    let cell_count: usize = extract_param(params, "cell_count").and_then(|s| s.parse().ok()).unwrap_or(8);
    let raw_payload = extract_param(params, "payload").unwrap_or_else(|| "LOG_PAYLOAD_TELEMETRY".to_string());
    let is_noise: bool = extract_param(params, "is_noise").and_then(|s| s.parse().ok()).unwrap_or(false);
    let size_nm: f64 = extract_param(params, "size_nm").and_then(|s| s.parse().ok()).unwrap_or(180.0);

    let mut chamber = genos_biology::specialized_cells::choanocyte::ChoanodermChamber::new(&chamber_id, cell_count);

    match action {
        "flow" | "pumping" => {
            let flow_rate = chamber.total_pumping_rate_ml_s();
            println!("{}", json!({
                "success": true, "feature": "choanocyte", "action": "flow",
                "chamber_id": chamber_id, "cells_count": cell_count,
                "total_pumping_rate_ml_s": flow_rate, "status": "HYDRODYNAMIC_CURRENT_ACTIVE"
            }));
        }
        _ => {
            let stream = vec![
                genos_biology::specialized_cells::choanocyte::RawSignalPacket {
                    id: format!("{}_pkt_1", chamber_id),
                    size_nm,
                    semantic_density: if is_noise { 0.1 } else { 0.85 },
                    content: raw_payload,
                    is_noise,
                }
            ];
            let res = chamber.sift_stream_collective(&stream);
            println!("{}", json!({
                "success": true, "feature": "choanocyte", "action": "sift",
                "chamber_id": chamber_id, "sifting_result": res
            }));
        }
    }
}

