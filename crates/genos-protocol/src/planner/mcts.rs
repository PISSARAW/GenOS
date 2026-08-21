use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_mcts(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "mcts_introspect" => {
            planner.args.push("mcts".to_string());
            planner.args.push("introspect".to_string());
            planner.push_flag("--node-id", planner.req_str("node_id")?);
            Ok(true)
        }
        "mcts_prune" => {
            planner.args.push("mcts".to_string());
            planner.args.push("prune".to_string());
            planner.push_flag("--node-id", planner.req_str("node_id")?);
            Ok(true)
        }
        _ => Ok(false),
    }
}
