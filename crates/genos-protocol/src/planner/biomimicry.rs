use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_biomimicry(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "biomimicry_swarm_consensus" => {
            planner.args = vec!["biomimicry".into(), "swarm-consensus".into()];
            planner.args.push("--target".into());
            planner.args.push(planner.req_str("target")?.into());
        }
        "biomimicry_flocking_explore" => {
            planner.args = vec!["biomimicry".into(), "flocking-explore".into()];
            planner.args.push("--area".into());
            planner.args.push(planner.req_str("area")?.into());
        }
        "biomimicry_network_quorum" => {
            planner.args = vec!["biomimicry".into(), "network-quorum".into()];
            planner.args.push("--node".into());
            planner.args.push(planner.req_str("node")?.into());
        }
        "biomimicry_distributed_huddle" => {
            planner.args = vec!["biomimicry".into(), "distributed-huddle".into()];
            planner.args.push("--state-file".into());
            planner.args.push(planner.req_str("state_file")?.into());
        }
        "biomimicry_inject_pheromone" => {
            planner.args = vec!["biomimicry".into(), "inject-pheromone".into()];
            planner.args.push("--node".into());
            planner.args.push(planner.req_str("node")?.into());
            planner.args.push("--type".into());
            planner.args.push(planner.req_str("pheromone_type")?.into());
            planner.args.push("--amount".into());
            planner.args.push(planner.req_str("amount")?.into());
        }
        "biomimicry_genetic_sos" => {
            planner.args = vec!["biomimicry".into(), "genetic-sos".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
            planner.args.push("--stress-level".into());
            planner.args.push(planner.req_str("stress_level")?.into());
        }
        "biomimicry_alter_plasmid" => {
            planner.args = vec!["biomimicry".into(), "alter-plasmid".into()];
            planner.args.push("--plasmid-id".into());
            planner.args.push(planner.req_str("plasmid_id")?.into());
            planner.args.push("--payload".into());
            planner.args.push(planner.req_str("payload")?.into());
        }
        "biomimicry_brier_consensus" => {
            planner.args = vec!["biomimicry".into(), "brier-consensus".into()];
            planner.args.push("--topic".into());
            planner.args.push(planner.req_str("topic")?.into());
        }
        "biomimicry_alter_huddle" => {
            planner.args = vec!["biomimicry".into(), "alter-huddle".into()];
            planner.args.push("--topic".into());
            planner.args.push(planner.req_str("topic")?.into());
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
            planner.args.push("--payload".into());
            planner.args.push(planner.req_str("payload")?.into());
        }
        "biomimicry_cryptobiosis_force" => {
            planner.args = vec!["biomimicry".into(), "cryptobiosis-force".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
        }
        "biomimicry_ampk_alter" => {
            planner.args = vec!["biomimicry".into(), "ampk-alter".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
            planner.args.push("--atp".into());
            planner.args.push(planner.req_str("atp")?.into());
            planner.args.push("--adp".into());
            planner.args.push(planner.req_str("adp")?.into());
            planner.args.push("--amp".into());
            planner.args.push(planner.req_str("amp")?.into());
        }
        "biomimicry_observe_gradient" => {
            planner.args = vec!["biomimicry".into(), "observe-gradient".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
        }
        "biomimicry_manipulate_gradient" => {
            planner.args = vec!["biomimicry".into(), "manipulate-gradient".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
            planner.args.push("--gradient-value".into());
            planner.args.push(planner.req_str("gradient_value")?.into());
        }
        _ => return Ok(false),
    }
    Ok(true)
}
