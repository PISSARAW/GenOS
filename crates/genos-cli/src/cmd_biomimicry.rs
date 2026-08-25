use crate::args::{
    DistributedHuddleArgs, FlockingExploreArgs, NetworkQuorumArgs, SwarmConsensusArgs, VoteKind,
};
use anyhow::{bail, Result};
use genos_core::biomimicry::{parse_facts, CycleGateKeeper, Phase};
use genos_core::organization::distributed::{Agent, PenguinHuddle};
use genos_core::organization::flocking::{boid_cohesion, Boid, Vec2};
use genos_core::organization::network::BacteriaNode;
use genos_core::organization::swarm::{Consensus, Decision};
use std::fs;
use std::path::Path;

/// Generic dispatcher for biomimicry feature modules. Each new feature only
/// adds a routing arm here; the CLI surface stays stable.
pub async fn cmd_biomimicry_feature(
    feature: &str,
    action: &str,
    params: &[String],
) -> Result<()> {
    match (feature, action) {
        ("gate", "evaluate") => gate_evaluate(params),
        ("chaperone", "repair") => chaperone_repair(params),
        ("epigenetic_chromatin", "modulate") => chromatin_modulate(params),
        (feature, action) => bail!("unknown bio-feature '{feature}/{action}'"),
    }
}

fn collect_params<'a>(params: &'a [String], key: &str) -> Vec<&'a str> {
    params
        .iter()
        .filter_map(|p| p.strip_prefix(key)?.strip_prefix('='))
        .collect()
}

fn chaperone_repair(params: &[String]) -> Result<()> {
    use genos_core::biomimicry::{CanonicalSchema, Chaperone, DamagedComponent, SlotValidator};
    let component_id = param_value(params, "component_id")
        .ok_or_else(|| anyhow::anyhow!("missing --param component_id=<id>"))?
        .to_string();
    let kind = param_value(params, "kind")
        .ok_or_else(|| anyhow::anyhow!("missing --param kind=<component kind>"))?
        .to_string();
    let fragments: Vec<String> =
        collect_params(params, "fragment").iter().map(|s| s.to_string()).collect();
    if fragments.is_empty() {
        bail!("at least one --param fragment=<value> is required ('' models a mis-folded slot)");
    }
    let templates: Vec<Option<String>> = collect_params(params, "template")
        .into_iter()
        .map(|t| if t == "-" { None } else { Some(t.to_string()) })
        .collect();
    let max_attempts: usize = param_value(params, "max_attempts")
        .and_then(|v| v.parse().ok())
        .unwrap_or(3);
    let atp_budget: u64 = param_value(params, "atp_budget")
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);

    let mut slot_templates: Vec<Option<String>> = vec![None; fragments.len()];
    for (i, template) in templates.into_iter().enumerate() {
        if i < slot_templates.len() {
            slot_templates[i] = template;
        }
    }
    let schema = CanonicalSchema {
        kind: kind.clone(),
        slots: vec![SlotValidator::NonEmpty; fragments.len()],
        templates: slot_templates,
    };
    let component = DamagedComponent {
        id: component_id.clone(),
        kind,
        fragments,
    };
    let mut chaperone = Chaperone::new(max_attempts, atp_budget);
    match chaperone.repair(&component, &schema) {
        genos_core::biomimicry::RepairOutcome::Repaired(folded) => {
            println!("Component {component_id} repaired:");
            for (i, fragment) in folded.iter().enumerate() {
                println!("  slot[{i}] = {fragment}");
            }
            Ok(())
        }
        genos_core::biomimicry::RepairOutcome::RecommendProteolysis { reason } => {
            bail!("chaperone recommends proteolysis for {component_id}: {reason}")
        }
    }
}

fn param_value<'a>(params: &'a [String], key: &str) -> Option<&'a str> {
    params.iter().find_map(|p| p.strip_prefix(key)?.strip_prefix('='))
}

fn chromatin_modulate(params: &[String]) -> Result<()> {
    let agent_id = param_value(params, "agent_id").unwrap_or("unknown");
    let promoter = param_value(params, "promoter").unwrap_or("unknown");
    let meth_delta = param_value(params, "methylation_delta").unwrap_or("0.0").parse::<f32>().unwrap_or(0.0);
    let acetyl_delta = param_value(params, "acetylation_delta").unwrap_or("0.0").parse::<f32>().unwrap_or(0.0);

    use genos_core::operon::{ChromatinVector, Operon};
    let mut operon = Operon {
        promoter: promoter.to_string(),
        genes: vec![],
        chromatin: ChromatinVector::default(),
    };

    println!("Modulating chromatin for agent {} on operon [promoter={}]", agent_id, promoter);
    if meth_delta > 0.0 {
        operon.chromatin.condense(meth_delta);
        println!("  -> Condensed chromatin (methylation +{})", meth_delta);
    } else if meth_delta < 0.0 {
        operon.chromatin.relax(-meth_delta);
        println!("  -> Relaxed chromatin (methylation {})", meth_delta);
    }
    
    if acetyl_delta > 0.0 {
        operon.chromatin.acetylate(acetyl_delta);
        println!("  -> Acetylated histones (acetylation +{})", acetyl_delta);
    } else if acetyl_delta < 0.0 {
        operon.chromatin.deacetylate(-acetyl_delta);
        println!("  -> Deacetylated histones (acetylation {})", acetyl_delta);
    }

    println!("  -> Final Chromatin Vector: methylation={:.2}, acetylation={:.2}, active={}", 
        operon.chromatin.methylation_level, operon.chromatin.histone_acetylation, operon.is_active());
        
    Ok(())
}

fn gate_evaluate(params: &[String]) -> Result<()> {
    let phase_raw = param_value(params, "phase")
        .ok_or_else(|| anyhow::anyhow!("missing --param phase=<init|fork|run|diff|merge>"))?;
    let phase = Phase::parse(phase_raw)
        .ok_or_else(|| anyhow::anyhow!("unknown phase '{phase_raw}'"))?;
    let facts: Vec<String> = params
        .iter()
        .filter(|p| !p.starts_with("phase="))
        .cloned()
        .collect();
    let facts = parse_facts(&facts).map_err(anyhow::Error::msg)?;
    let keeper = CycleGateKeeper::with_defaults();
    let report = keeper.evaluate(phase, &facts);
    println!(
        "Gate {} : {} ({} règles vérifiées)",
        report.phase.as_str(),
        if report.passed { "PASSED" } else { "BLOCKED" },
        report.checked_rules
    );
    for rule in &report.violated_rules {
        println!("  violated: {rule}");
    }
    for fact in &report.missing_facts {
        println!("  missing fact: {fact}");
    }
    if !report.passed {
        bail!("checkpoint gate blocked; progression to next phase is forbidden");
    }
    Ok(())
}

pub async fn cmd_biomimicry_swarm_consensus(args: SwarmConsensusArgs) -> Result<()> {
    println!("Triggering swarm consensus for target: {}", args.target);
    let mut consensus = Consensus::new();
    for vote in &args.votes {
        consensus.vote(match vote {
            VoteKind::Explore => Decision::Explore,
            VoteKind::Exploit => Decision::Exploit,
            VoteKind::Rest => Decision::Rest,
        });
    }
    match consensus.resolve() {
        Some(decision) => {
            let tally = args
                .votes
                .iter()
                .map(|vote| format!("{vote:?}").to_lowercase())
                .collect::<Vec<_>>()
                .join(", ");
            println!("Votes: [{tally}]");
            println!("Consensus reached: {decision:?}");
        }
        None => println!("No votes cast; no consensus"),
    }
    Ok(())
}

pub async fn cmd_biomimicry_flocking_explore(args: FlockingExploreArgs) -> Result<()> {
    println!(
        "Deploying boids to explore area: {} ({} steps from ({:.1}, {:.1}))",
        args.area, args.steps, args.x, args.y
    );
    let mut boid = Boid::new(Vec2::new(args.x, args.y), Vec2::new(1.0, 0.0));
    let neighbors = vec![Boid::new(Vec2::new(1.0, 1.0), Vec2::new(1.0, 0.0))];
    for step in 1..=args.steps {
        let cohesion = boid_cohesion(&boid, &neighbors, 5.0);
        boid.apply_force(&cohesion);
        boid.update_pos(2.0);
        println!("Step {}: boid at {:?}", step, boid.pos);
    }
    Ok(())
}

pub async fn cmd_biomimicry_network_quorum(args: NetworkQuorumArgs) -> Result<()> {
    println!(
        "Evaluating network quorum for node: {} (signal {}, threshold {})",
        args.node, args.signal, args.threshold
    );
    let mut node = BacteriaNode::new(1);
    node.sense_environment(args.signal);
    if node.should_activate(args.threshold) {
        println!("Quorum reached! Activating node.");
    } else {
        println!("Quorum not reached yet.");
    }
    Ok(())
}

pub async fn cmd_biomimicry_distributed_huddle(args: DistributedHuddleArgs) -> Result<()> {
    let path = Path::new(&args.state_file);
    let (mut huddle, existed) = load_huddle(path)?;
    if existed {
        println!("Loaded huddle state from {}", args.state_file);
    } else {
        println!(
            "No huddle state at {}; starting a default pair",
            args.state_file
        );
    }
    huddle.share_heat();
    save_huddle(path, &huddle)?;
    for member in &huddle.members {
        println!(
            "Member {} energy after sharing: {}",
            member.id, member.energy
        );
    }
    Ok(())
}

fn load_huddle(path: &Path) -> Result<(PenguinHuddle, bool)> {
    if !path.is_file() {
        let mut huddle = PenguinHuddle::new();
        huddle.add_penguin(Agent::new("P1".to_string(), 100));
        huddle.add_penguin(Agent::new("P2".to_string(), 20));
        return Ok((huddle, false));
    }

    let raw = fs::read_to_string(path)?;
    let value: serde_json::Value = serde_json::from_str(&raw)?;
    let mut huddle = PenguinHuddle::new();
    match value.get("members").and_then(serde_json::Value::as_array) {
        Some(members) => {
            for member in members {
                let id = member
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let energy = member
                    .get("energy")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or_default() as u32;
                huddle.add_penguin(Agent::new(id, energy));
            }
        }
        None => return Ok((huddle, true)),
    }
    Ok((huddle, true))
}

fn save_huddle(path: &Path, huddle: &PenguinHuddle) -> Result<()> {
    let members: Vec<serde_json::Value> = huddle
        .members
        .iter()
        .map(|member| {
            serde_json::json!({
                "id": member.id,
                "energy": member.energy,
            })
        })
        .collect();
    let payload = serde_json::json!({ "members": members });
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(&payload)?)?;
    println!("Huddle state saved to {}", path.display());
    Ok(())
}
