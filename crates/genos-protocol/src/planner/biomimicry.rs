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
        _ => return Ok(false),
    }
    Ok(true)
}
