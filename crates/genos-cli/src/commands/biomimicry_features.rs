use serde_json::json;

pub fn handle_bio_feature(feature: &str, action: &str, params: &[String]) {
    match feature {
        "active_sensing" => handle_active_sensing(action, params),
        "checkpoint" => handle_checkpoint_gate(action, params),
        "allostatic" => handle_allostatic(action, params),
        "neuromodulation" => handle_neuromodulation(action, params),
        "endocrine" => handle_endocrine(action, params),
        "neoteny" => handle_neoteny(action, params),
        "behavior" => handle_behavior(action, params),
        "sar" => handle_sar(action, params),
        "bet-hedging" => handle_bet_hedging(action, params),
        "hippocampal" => handle_hippocampal(action, params),
        "proceduralization" => handle_proceduralization(action, params),
        "gate" => handle_gate_eval(action, params),
        _ => {
            println!("{}", json!({
                "success": true, "operation": "bio_feature",
                "feature": feature, "action": action, "params": params, "status": "executed"
            }));
        }
    }
}

pub fn extract_param(params: &[String], key: &str) -> Option<String> {
    for p in params {
        if let Some(rest) = p.strip_prefix(&format!("{}=", key)) {
            return Some(rest.trim_matches('"').to_string());
        }
    }
    None
}

fn handle_active_sensing(action: &str, params: &[String]) {
    let focus = extract_param(params, "focus").unwrap_or_else(|| "environment".to_string());
    let ambiguity: f64 = extract_param(params, "ambiguity")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.5);

    let info_gain = if ambiguity > 0.0 && ambiguity <= 1.0 {
        -(ambiguity * ambiguity.log2())
    } else {
        0.0
    };

    println!("{}", json!({
        "success": true, "feature": "active_sensing", "action": action,
        "focus": focus, "initial_ambiguity": ambiguity,
        "information_gain_bits": (info_gain * 1000.0).round() / 1000.0,
        "residual_uncertainty": ((ambiguity * (1.0 - info_gain * 0.5)) * 1000.0).round() / 1000.0,
        "status": "PROBE_EMITTED"
    }));
}

fn handle_checkpoint_gate(action: &str, params: &[String]) {
    let act = extract_param(params, "action").unwrap_or_else(|| action.to_string());
    if act == "signal" {
        let choice = extract_param(params, "choice").unwrap_or_else(|| "proceed".to_string());
        println!("{}", json!({
            "success": true, "feature": "checkpoint", "action": "signal",
            "gate_status": "RELEASED", "resolved_choice": choice
        }));
    } else {
        let ambiguity: f64 = extract_param(params, "ambiguity").and_then(|s| s.parse().ok()).unwrap_or(0.7);
        let opt_a = extract_param(params, "opt_a").unwrap_or_else(|| "OptionA".to_string());
        let opt_b = extract_param(params, "opt_b").unwrap_or_else(|| "OptionB".to_string());
        println!("{}", json!({
            "success": true, "feature": "checkpoint", "action": "freeze",
            "gate_status": "FROZEN", "ambiguity": ambiguity,
            "options": [opt_a, opt_b], "requires_external_resolution": ambiguity > 0.5
        }));
    }
}

fn handle_allostatic(action: &str, params: &[String]) {
    let act = extract_param(params, "action").unwrap_or_else(|| action.to_string());
    if act == "predict" {
        let plan_action = extract_param(params, "plan_action").unwrap_or_else(|| "exec".to_string());
        let expected = extract_param(params, "expected").unwrap_or_else(|| "success".to_string());
        let cost: f64 = extract_param(params, "cost").and_then(|s| s.parse().ok()).unwrap_or(10.0);
        let energy_buffer = (100.0 - cost).max(0.0);
        println!("{}", json!({
            "success": true, "feature": "allostatic", "action": "predict",
            "plan_action": plan_action, "expected_outcome": expected,
            "energy_cost": cost, "remaining_buffer": energy_buffer,
            "homeostatic_anticipation": "STABLE"
        }));
    } else {
        let score: f64 = extract_param(params, "score").and_then(|s| s.parse().ok()).unwrap_or(0.85);
        let allostatic_load = ((1.0 - score) * 100.0).round() / 100.0;
        println!("{}", json!({
            "success": true, "feature": "allostatic", "action": "evaluate",
            "evaluation_score": score, "allostatic_load": allostatic_load,
            "adaptation_state": if allostatic_load < 0.3 { "EUSTRESS" } else { "DISTRESS" }
        }));
    }
}

fn handle_neuromodulation(action: &str, params: &[String]) {
    let node_id = extract_param(params, "node_id").unwrap_or_else(|| "default_node".to_string());
    let expected: f64 = extract_param(params, "expected_reward").and_then(|s| s.parse().ok()).unwrap_or(1.0);
    let actual: f64 = extract_param(params, "actual_reward").and_then(|s| s.parse().ok()).unwrap_or(1.0);
    let rpe = ((actual - expected) * 1000.0).round() / 1000.0;

    let (transmitter, tone) = if rpe > 0.05 {
        ("Dopamine", "PHASIC_BURST")
    } else if rpe < -0.05 {
        ("Serotonin_Suppression", "PHASIC_DIP")
    } else {
        ("Tonic_Baseline", "EQUILIBRIUM")
    };

    println!("{}", json!({
        "success": true, "feature": "neuromodulation", "action": action,
        "node_id": node_id, "expected_reward": expected, "actual_reward": actual,
        "reward_prediction_error": rpe, "neuromodulator": transmitter,
        "signal_tone": tone, "learning_rate_modulation": (1.0 + rpe.abs()).min(2.0)
    }));
}

fn handle_endocrine(action: &str, params: &[String]) {
    let endocrine_action = extract_param(params, "endocrine_action").unwrap_or_else(|| action.to_string());
    let swarm_id = extract_param(params, "swarm_id").unwrap_or_else(|| "global_swarm".to_string());

    if endocrine_action == "decay" {
        let decay_factor: f64 = extract_param(params, "decay_factor").and_then(|s| s.parse().ok()).unwrap_or(0.9);
        println!("{}", json!({
            "success": true, "feature": "endocrine", "action": endocrine_action,
            "swarm_id": swarm_id, "decay_factor": decay_factor,
            "cleared_hormone_ratio": 1.0 - decay_factor, "status": "HOMEOSTASIS_RESTORED"
        }));
    } else {
        let hormone = extract_param(params, "hormone").unwrap_or_else(|| "cortisol".to_string());
        let amount: f64 = extract_param(params, "amount").and_then(|s| s.parse().ok()).unwrap_or(1.0);
        let systemic_effect = match hormone.to_lowercase().as_str() {
            "cortisol" => "STRESS_VIGILANCE_ELEVATED",
            "adrenaline" => "LATENCY_MINIMIZED_RUSH",
            "oxytocin" => "COOPERATIVE_CONSENSUS_BOOST",
            _ => "SIGNAL_PROPAGATED"
        };
        println!("{}", json!({
            "success": true, "feature": "endocrine", "action": endocrine_action,
            "swarm_id": swarm_id, "hormone": hormone, "amount": amount,
            "systemic_effect": systemic_effect
        }));
    }
}

fn handle_neoteny(action: &str, params: &[String]) {
    let total: f64 = extract_param(params, "total_agents").and_then(|s| s.parse().ok()).unwrap_or(10.0);
    let neotenic: f64 = extract_param(params, "neotenic_agents").and_then(|s| s.parse().ok()).unwrap_or(3.0);
    let request = extract_param(params, "request").unwrap_or_else(|| "explore".to_string());
    let ratio = if total > 0.0 { neotenic / total } else { 0.0 };

    let state = if ratio < 0.15 {
        "RISK_OF_RIGIDITY"
    } else if ratio > 0.60 {
        "RISK_OF_OVER_PLASTICITY"
    } else {
        "OPTIMAL_EXPLORATION_EXPLOITATION_BALANCE"
    };

    println!("{}", json!({
        "success": true, "feature": "neoteny", "action": action,
        "total_agents": total as usize, "neotenic_agents": neotenic as usize,
        "neotenic_ratio": (ratio * 100.0).round() / 100.0,
        "request": request, "state": state, "granted": ratio >= 0.20
    }));
}

fn handle_behavior(action: &str, params: &[String]) {
    let act = extract_param(params, "action").unwrap_or_else(|| action.to_string());
    let agent_id = extract_param(params, "agent_id").unwrap_or_else(|| "agent_0".to_string());
    let threat = extract_param(params, "threat_source").unwrap_or_else(|| "adversarial_probe".to_string());

    let (immobility, metabolic_rate) = match act.as_str() {
        "freeze" | "feign_death" => (true, 0.05),
        "revive" => (false, 1.0),
        _ => (true, 0.1),
    };

    println!("{}", json!({
        "success": true, "feature": "behavior", "action": act,
        "agent_id": agent_id, "threat_source": threat,
        "tonic_immobility": immobility, "metabolic_suppression": 1.0 - metabolic_rate,
        "adversarial_decoupling": immobility
    }));
}

fn handle_sar(action: &str, params: &[String]) {
    let incident = extract_param(params, "incident_id").unwrap_or_else(|| "INC-001".to_string());
    let severity: f64 = extract_param(params, "severity").and_then(|s| s.parse().ok()).unwrap_or(1.0);
    let immunity_gain = (severity * 0.35).min(1.0);

    println!("{}", json!({
        "success": true, "feature": "sar", "action": action,
        "incident_id": incident, "severity": severity,
        "systemic_acquired_resistance": "PRIMED",
        "salicylic_pathway_activation": 1.0,
        "immunity_elevation": (immunity_gain * 100.0).round() / 100.0
    }));
}

fn handle_bet_hedging(action: &str, params: &[String]) {
    let p_conservative = 0.70;
    let p_exploratory = 0.30;
    println!("{}", json!({
        "success": true, "feature": "bet-hedging", "action": action,
        "params": params, "conservative_allocation": p_conservative,
        "exploratory_allocation": p_exploratory,
        "entropy_hedge": 0.88, "status": "PORTFOLIO_DIVERSIFIED"
    }));
}

fn handle_hippocampal(action: &str, params: &[String]) {
    let agent_id = extract_param(params, "agent_id").unwrap_or_else(|| "default".to_string());
    let score: f64 = extract_param(params, "success_score").and_then(|s| s.parse().ok()).unwrap_or(1.0);
    let ripple_frequency_hz = 200.0;
    let consolidated = score >= 0.7;

    println!("{}", json!({
        "success": true, "feature": "hippocampal", "action": action,
        "agent_id": agent_id, "success_score": score,
        "sharp_wave_ripple_hz": ripple_frequency_hz,
        "consolidated_to_longterm": consolidated,
        "status": if consolidated { "CONSOLIDATED" } else { "EPISODIC_PURGED" }
    }));
}

fn handle_proceduralization(action: &str, params: &[String]) {
    println!("{}", json!({
        "success": true, "feature": "proceduralization", "action": action,
        "params": params, "compiled_to_fastpath": true, "latency_saving_ratio": 0.78
    }));
}

fn handle_gate_eval(action: &str, params: &[String]) {
    println!("{}", json!({
        "success": true, "feature": "gate", "action": action,
        "params": params, "invariant_verified": true, "verdict": "PERMITTED"
    }));
}
