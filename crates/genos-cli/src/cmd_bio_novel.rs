use anyhow::Result;

pub(crate) fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params
        .iter()
        .find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

pub fn active_sensing_emit(params: &[String]) -> Result<()> {
    let focus = param_value(params, "focus")
        .ok_or_else(|| anyhow::anyhow!("missing --param focus=<focus>"))?;
    let ambiguity = param_value(params, "ambiguity")
        .and_then(|v| v.parse::<f32>().ok())
        .unwrap_or(0.5);
    
    let mut state = genos_core::biomimicry::active_sensing::EcholocationState::default();
    let id = state.emit_click(focus.to_string(), ambiguity);
    println!("Active sensing click emitted: ID={}, focus={}, ambiguity={}", id, focus, ambiguity);
    Ok(())
}

pub fn active_sensing_receive(params: &[String]) -> Result<()> {
    let click_id = param_value(params, "click_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param click_id=<id>"))?;
    let resolution = param_value(params, "resolution")
        .unwrap_or("none");
    let mapped = param_value(params, "mapped")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false);

    let mut state = genos_core::biomimicry::active_sensing::EcholocationState::default();
    state.receive_echo(click_id.to_string(), resolution.to_string(), mapped);
    println!("Echo received for {}: mapped={}. Map completeness: {:.2}", click_id, mapped, state.map_completeness);
    Ok(())
}

pub fn checkpoint_gate(params: &[String]) -> Result<()> {
    let action = param_value(params, "action")
        .ok_or_else(|| anyhow::anyhow!("missing --param action=<freeze|signal>"))?;

    if action == "freeze" {
        let ambiguity = param_value(params, "ambiguity")
            .ok_or_else(|| anyhow::anyhow!("missing --param ambiguity=<desc>"))?;
        let opt_a = param_value(params, "opt_a")
            .ok_or_else(|| anyhow::anyhow!("missing --param opt_a=<choice>"))?;
        let opt_b = param_value(params, "opt_b")
            .ok_or_else(|| anyhow::anyhow!("missing --param opt_b=<choice>"))?;
        
        let _cp = genos_core::biomimicry::cellular_checkpoint::CellularCheckpoint::freeze_and_request(
            ambiguity.to_string(), opt_a.to_string(), opt_b.to_string()
        );
        println!("THREAD FROZEN. Ambiguity: {}. Require chemical signal: {} OR {}", ambiguity, opt_a, opt_b);
        return Ok(());
    } else if action == "signal" {
        let choice = param_value(params, "choice")
            .ok_or_else(|| anyhow::anyhow!("missing --param choice=<val>"))?;
        println!("Signal accepted: {}. Thread resumed deterministically.", choice);
        return Ok(());
    } else {
        anyhow::bail!("Unknown checkpoint action");
    }
}

pub fn allostatic_plan(params: &[String]) -> Result<()> {
    let action = param_value(params, "action")
        .ok_or_else(|| anyhow::anyhow!("missing --param action=<predict|evaluate>"))?;

    let mut model = genos_core::biomimicry::allostatic_planning::AllostaticModel::default();

    if action == "predict" {
        let act = param_value(params, "plan_action").unwrap_or("unknown");
        let outcome = param_value(params, "expected").unwrap_or("success");
        let cost = param_value(params, "cost").and_then(|v| v.parse::<f32>().ok()).unwrap_or(1.0);
        
        let id = model.predict(act.to_string(), outcome.to_string(), cost);
        println!("Allostatic Prediction [{}] created: action={}, expected={}, cost={}", id, act, outcome, cost);
        return Ok(());
    } else if action == "evaluate" {
        let score = param_value(params, "score").and_then(|v| v.parse::<f32>().ok()).unwrap_or(1.0);
        model.evidences.push(genos_core::biomimicry::allostatic_planning::Evidence { prediction_id: 0, validation_score: score });
        let viability = model.evaluate_viability();
        println!("Allostatic plan evaluated. Viability: {:.2}. Proceeding to metabolize tokens if viable.", viability);
        return Ok(());
    } else {
        anyhow::bail!("Unknown allostatic action");
    }
}

pub fn reciprocity_decide(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{PeerAction, PeerRecord, ReciprocityPolicy, ReputationLedger};
    let peer_id = param_value(params, "peer_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param peer_id=<id>"))?
        .to_string();
    let cooperations: u32 = param_value(params, "cooperations")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let defections: u32 = param_value(params, "defections")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let last: Option<PeerAction> = match param_value(params, "last_action") {
        Some("cooperate") => Some(PeerAction::Cooperate),
        Some("defect") => Some(PeerAction::Defect),
        Some(other) => {
            anyhow::bail!("invalid last_action '{other}' (expected cooperate|defect)")
        }
        None => None,
    };
    let mut ledger = ReputationLedger::default();
    {
        let record = ledger.peers.entry(peer_id.clone()).or_default();
        record.cooperations = cooperations;
        record.defections = defections;
        if let Some(action) = last {
            record.last_action = Some(action);
        }
    }
    let policy = ReciprocityPolicy::default();
    let decision = ledger.decide(&policy, &peer_id);
    let record: &PeerRecord = &ledger.peers[&peer_id];
    println!(
        "Peer {peer_id}: interactions={} defection_ratio={:.2}",
        record.interactions(),
        record.defection_ratio()
    );
    match decision {
        genos_core::biomimicry::Decision::Cooperate => {
            println!("Decision: COOPERATE");
            Ok(())
        }
        genos_core::biomimicry::Decision::Retaliate => {
            println!("Decision: RETALIATE (free-riding contained)");
            anyhow::bail!("reciprocity policy retaliates against {peer_id}")
        }
    }
}

pub fn neoteny_quota(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{NeotenyPolicy, SpawnDecision, SpawnRequest};
    let total: usize = param_value(params, "total_agents")
        .ok_or_else(|| anyhow::anyhow!("missing --param total_agents=<n>"))?
        .parse()?;
    let neotenic: usize = param_value(params, "neotenic_agents")
        .ok_or_else(|| anyhow::anyhow!("missing --param neotenic_agents=<n>"))?
        .parse()?;
    let request = match param_value(params, "request") {
        Some("neotenic") => SpawnRequest::Neotenic,
        Some("specialist") => SpawnRequest::Specialist,
        _ => anyhow::bail!("missing or invalid --param request=<neotenic|specialist>"),
    };
    let fraction: f64 = param_value(params, "fraction")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.2);
    let policy = NeotenyPolicy::new(fraction);
    match policy.decide_spawn(total, neotenic, request) {
        SpawnDecision::Allowed { as_neotenic } => {
            if as_neotenic {
                println!(
                    "Spawn allowed: neotenic individual (reserve coverage {:.0}%)",
                    policy.coverage(total, neotenic) * 100.0
                );
            } else {
                println!(
                    "Spawn allowed: specialist (reserve coverage {:.0}%)",
                    policy.coverage(total, neotenic) * 100.0
                );
            }
            Ok(())
        }
        SpawnDecision::Deferred { reason } => {
            anyhow::bail!("spawn deferred: {reason}")
        }
    }
}

