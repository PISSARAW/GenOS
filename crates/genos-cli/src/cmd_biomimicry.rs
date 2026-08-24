use crate::args::{
    DistributedHuddleArgs, FlockingExploreArgs, NetworkQuorumArgs, SwarmConsensusArgs, VoteKind,
};
use anyhow::Result;
use genos_core::organization::distributed::{Agent, PenguinHuddle};
use genos_core::organization::flocking::{boid_cohesion, Boid, Vec2};
use genos_core::organization::network::BacteriaNode;
use genos_core::organization::swarm::{Consensus, Decision};
use std::fs;
use std::path::Path;

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
