use serde_json::json;
use crate::args::BiomimicrySubcommands;
use crate::commands::biomimicry_features::extract_param;

pub fn handle_sensory_subcommands(cmd: BiomimicrySubcommands) -> Result<bool, String> {
    match cmd {
        BiomimicrySubcommands::Vomeronasal { agent_id, locus, pheromone_type, concentration, sensitivity } => {
            let params = vec![
                format!("agent_id={}", agent_id),
                format!("locus={}", locus),
                format!("pheromone_type={}", pheromone_type),
                format!("concentration={}", concentration),
                format!("sensitivity={}", sensitivity),
            ];
            handle_sensory_feature("vomeronasal", "emit_and_detect", &params);
            Ok(true)
        }
        BiomimicrySubcommands::Electrosensory { agent_id, action, frequency_hz, sensitivity, distortion_threshold, samples } => {
            let params = vec![
                format!("agent_id={}", agent_id),
                format!("frequency_hz={}", frequency_hz),
                format!("sensitivity={}", sensitivity),
                format!("distortion_threshold={}", distortion_threshold),
                format!("samples={}", samples),
            ];
            handle_sensory_feature("electrosensory", &action, &params);
            Ok(true)
        }
        BiomimicrySubcommands::ClusterN { agent_id, action, sensitivity, tolerance_deg, goal_vector, current_vector } => {
            let params = vec![
                format!("agent_id={}", agent_id),
                format!("sensitivity={}", sensitivity),
                format!("tolerance_deg={}", tolerance_deg),
                format!("goal_vector={}", goal_vector),
                format!("current_vector={}", current_vector),
            ];
            handle_sensory_feature("cluster_n", &action, &params);
            Ok(true)
        }
        BiomimicrySubcommands::TectumThermal { agent_id, action, sensitivity_mk, fusion_weight, threshold, visual_nodes, thermal_readings } => {
            let params = vec![
                format!("agent_id={}", agent_id),
                format!("sensitivity_mk={}", sensitivity_mk),
                format!("fusion_weight={}", fusion_weight),
                format!("threshold={}", threshold),
                format!("visual_nodes={}", visual_nodes),
                format!("thermal_readings={}", thermal_readings),
            ];
            handle_sensory_feature("tectum_thermal", &action, &params);
            Ok(true)
        }
        BiomimicrySubcommands::Echolocation { agent_id, action, base_frequency_khz, obstacle_threshold_m, echoes } => {
            let params = vec![
                format!("agent_id={}", agent_id),
                format!("base_frequency_khz={}", base_frequency_khz),
                format!("obstacle_threshold_m={}", obstacle_threshold_m),
                format!("echoes={}", echoes),
            ];
            handle_sensory_feature("echolocation", &action, &params);
            Ok(true)
        }
        _ => Ok(false),
    }
}

pub fn handle_sensory_feature(feature: &str, action: &str, params: &[String]) {
    match feature {
        "vomeronasal" | "accessory_olfactory" => handle_vomeronasal(action, params),
        "electrosensory" | "mormyrocerebellum" => handle_electrosensory(action, params),
        "cluster_n" | "magnetoreception" => handle_cluster_n(action, params),
        "tectum_thermal" | "infrared_pit" => handle_tectum_thermal(action, params),
        "echolocation" | "ultrasonic" => handle_echolocation(action, params),
        _ => {
            println!("{}", json!({ "success": true, "feature": feature, "action": action, "status": "executed" }));
        }
    }
}

fn handle_vomeronasal(action: &str, params: &[String]) {
    let source_agent = extract_param(params, "agent_id")
        .or_else(|| extract_param(params, "source_agent"))
        .unwrap_or_else(|| "agent_0".to_string());
    let locus = extract_param(params, "locus").unwrap_or_else(|| "global_field".to_string());
    let ptype_str = extract_param(params, "pheromone_type").unwrap_or_else(|| "alarm".to_string());
    let concentration: f64 = extract_param(params, "concentration").and_then(|s| s.parse().ok()).unwrap_or(0.8);
    let sensitivity: f64 = extract_param(params, "sensitivity").and_then(|s| s.parse().ok()).unwrap_or(0.15);

    let ptype = match ptype_str.to_lowercase().as_str() {
        "alarm" => genos_biology::sensory::PheromoneType::Alarm,
        "aggression" | "defense" | "aggression_defense" => genos_biology::sensory::PheromoneType::AggressionDefense,
        "cooperation" | "mating" | "mating_cooperation" => genos_biology::sensory::PheromoneType::MatingCooperation,
        "territory" | "territory_mark" => genos_biology::sensory::PheromoneType::TerritoryMark,
        "trail" => genos_biology::sensory::PheromoneType::Trail,
        other => genos_biology::sensory::PheromoneType::Custom(other.to_string()),
    };

    let mut aob = genos_biology::sensory::AccessoryOlfactoryBulb::new(sensitivity);
    let signal = genos_biology::sensory::PheromoneSignal::new(&source_agent, &locus, ptype.clone(), concentration);
    let response = aob.receive_signal(signal);

    println!("{}", json!({
        "success": true, "feature": "vomeronasal", "action": action,
        "source_agent": source_agent, "locus": locus, "pheromone_type": format!("{:?}", ptype),
        "concentration": concentration, "sensitivity_threshold": sensitivity,
        "flehmen_response": {
            "triggered": response.triggered, "autonomic_action": response.autonomic_action,
            "urgency_score": response.urgency_score, "bypass_cortical_deliberation": response.bypass_cortical_deliberation,
            "metabolic_shift": response.metabolic_shift
        }
    }));
}

fn handle_electrosensory(action: &str, params: &[String]) {
    let agent_id = extract_param(params, "agent_id").unwrap_or_else(|| "mormyro_agent_0".to_string());
    let freq: f64 = extract_param(params, "frequency_hz").and_then(|s| s.parse().ok()).unwrap_or(800.0);
    let sensitivity: f64 = extract_param(params, "sensitivity").and_then(|s| s.parse().ok()).unwrap_or(0.05);
    let threshold: f64 = extract_param(params, "distortion_threshold").and_then(|s| s.parse().ok()).unwrap_or(0.12);

    let raw_samples_str = extract_param(params, "samples")
        .or_else(|| extract_param(params, "impedance_samples"))
        .unwrap_or_else(|| "100.0,102.0,98.0,105.0,99.0".to_string());

    let samples: Vec<f64> = raw_samples_str.split(',').filter_map(|s| s.trim().parse().ok()).collect();
    let mut mormyro = genos_biology::sensory::MormyroCerebellum::new(freq, sensitivity, threshold);

    if action == "passive_scan" || action == "passive" {
        let res = mormyro.passive_scan(&samples);
        println!("{}", json!({
            "success": true, "feature": "electrosensory", "action": "passive_scan",
            "agent_id": agent_id, "detected_micro_impulses": res.detected_micro_impulses,
            "ambient_field_noise_db": res.ambient_field_noise_db, "max_signal_to_noise_ratio": res.max_signal_to_noise_ratio,
            "localized_hotspot_index": res.localized_hotspot_index, "silent_process_detected": res.silent_process_detected
        }));
    } else {
        let res = mormyro.discharge_and_analyze(&samples);
        println!("{}", json!({
            "success": true, "feature": "electrosensory", "action": "discharge_and_analyze",
            "agent_id": agent_id, "eod_frequency_hz": res.eod_frequency_hz, "emitted_amplitude": res.emitted_amplitude,
            "distortion_factor": res.distortion_factor, "capacitive_reactance": res.capacitive_reactance,
            "detected_anomalies_count": res.detected_anomalies_count, "spatial_contrast_score": res.spatial_contrast_score,
            "hidden_obstacles_detected": res.hidden_obstacles_detected, "environment_clarity_score": res.environment_clarity_score
        }));
    }
}

fn handle_cluster_n(action: &str, params: &[String]) {
    let agent_id = extract_param(params, "agent_id").unwrap_or_else(|| "migratory_agent_0".to_string());
    let sensitivity: f64 = extract_param(params, "sensitivity").or_else(|| extract_param(params, "inclination_sensitivity")).and_then(|s| s.parse().ok()).unwrap_or(0.02);
    let tolerance: f64 = extract_param(params, "tolerance_deg").or_else(|| extract_param(params, "drift_tolerance_deg")).and_then(|s| s.parse().ok()).unwrap_or(15.0);

    let goal_str = extract_param(params, "goal_vector").or_else(|| extract_param(params, "goal")).unwrap_or_else(|| "1.0,0.0,0.0".to_string());
    let curr_str = extract_param(params, "current_vector").or_else(|| extract_param(params, "current")).unwrap_or_else(|| "0.96,0.15,0.0".to_string());

    let goal_vec: Vec<f64> = goal_str.split(',').filter_map(|s| s.trim().parse().ok()).collect();
    let curr_vec: Vec<f64> = curr_str.split(',').filter_map(|s| s.trim().parse().ok()).collect();

    let mut cluster_n = genos_biology::sensory::ClusterN::new(sensitivity, tolerance);
    let report = cluster_n.compute_intent_heading(&goal_vec, &curr_vec);

    println!("{}", json!({
        "success": true, "feature": "cluster_n", "action": action,
        "agent_id": agent_id, "angular_drift_deg": report.angular_drift_deg,
        "cosine_similarity": report.cosine_similarity, "quantum_coherence_score": report.quantum_coherence_score,
        "is_aligned": report.is_aligned, "correction_heading": report.correction_heading,
        "navigational_state": report.navigational_state, "radical_state": format!("{:?}", report.radical_state)
    }));
}

fn handle_tectum_thermal(action: &str, params: &[String]) {
    let agent_id = extract_param(params, "agent_id").unwrap_or_else(|| "viper_0".to_string());
    let sensitivity_mk: f64 = extract_param(params, "sensitivity_mk").and_then(|s| s.parse().ok()).unwrap_or(3.0);
    let fusion_weight: f64 = extract_param(params, "fusion_weight").or_else(|| extract_param(params, "alpha")).and_then(|s| s.parse().ok()).unwrap_or(0.65);
    let threshold: f64 = extract_param(params, "threshold").or_else(|| extract_param(params, "hotspot_threshold")).and_then(|s| s.parse().ok()).unwrap_or(0.70);

    let visual_str = extract_param(params, "visual_nodes").unwrap_or_else(|| "src/auth.rs:0.8,src/db.rs:0.4,src/api.rs:0.3".to_string());
    let thermal_str = extract_param(params, "thermal_readings").unwrap_or_else(|| "src/auth.rs:0.95,src/db.rs:0.2,src/api.rs:0.1".to_string());

    let parse_pairs = |s: &str| -> Vec<(String, f64)> {
        s.split(',')
            .filter_map(|part| {
                let mut it = part.split(':');
                let locus = it.next()?.trim().to_string();
                let val = it.next()?.trim().parse::<f64>().ok()?;
                Some((locus, val))
            })
            .collect()
    };

    let visual_nodes = parse_pairs(&visual_str);
    let thermal_readings = parse_pairs(&thermal_str);

    let mut tectum = genos_biology::sensory::TectumOpticum::new(sensitivity_mk, fusion_weight, threshold);
    let map = tectum.fuse_modalities(&visual_nodes, &thermal_readings);

    println!("{}", json!({
        "success": true, "feature": "tectum_thermal", "action": action,
        "agent_id": agent_id, "ambient_thermal_baseline": map.ambient_thermal_baseline,
        "max_thermal_gradient": map.max_thermal_gradient, "hotspots_count": map.hotspots_count,
        "primary_strike_target": map.primary_strike_target, "fused_targets": map.fused_targets
    }));
}

fn handle_echolocation(action: &str, params: &[String]) {
    let agent_id = extract_param(params, "agent_id").unwrap_or_else(|| "bat_0".to_string());
    let base_freq: f64 = extract_param(params, "base_frequency_khz").and_then(|s| s.parse().ok()).unwrap_or(60.0);
    let threshold_m: f64 = extract_param(params, "obstacle_threshold_m").and_then(|s| s.parse().ok()).unwrap_or(2.5);
    let echoes_str = extract_param(params, "echoes").unwrap_or_else(|| "branch/auth:10.0:500.0:20.0,db/deadlock:40.0:-100.0:45.0".to_string());

    let echoes: Vec<genos_biology::sensory::EchoReturn> = echoes_str
        .split(',')
        .filter_map(|part| {
            let mut it = part.split(':');
            let locus = it.next()?.trim().to_string();
            let tof = it.next()?.trim().parse::<f64>().ok()?;
            let doppler = it.next()?.trim().parse::<f64>().ok()?;
            let att = it.next()?.trim().parse::<f64>().ok()?;
            Some(genos_biology::sensory::EchoReturn {
                target_locus: locus,
                time_of_flight_ms: tof,
                doppler_shift_hz: doppler,
                attenuation_db: att,
            })
        })
        .collect();

    let mut cortex = genos_biology::sensory::EcholocationCortex::new(base_freq, 150.0, 340.0, threshold_m);
    let pulse = cortex.emit_chirp(25.0, 4.0);
    let map = cortex.process_echoes(&pulse, &echoes);

    println!("{}", json!({
        "success": true, "feature": "echolocation", "action": action,
        "agent_id": agent_id, "pulse_frequency_khz": map.pulse_frequency_khz,
        "echo_count": map.echo_count, "spatial_depth_meters": map.spatial_depth_meters,
        "nearest_obstacle": map.nearest_obstacle, "high_velocity_nodes": map.high_velocity_nodes,
        "navigable_corridors_count": map.navigable_corridors_count, "echo_nodes": map.echo_nodes
    }));
}

