use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_memory(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "inspect_manifest" => {
            planner.args = vec!["memory".into(), "inspect-manifest".into()];
            planner.args.push("--snapshot-id".into());
            planner.args.push(planner.req_str("snapshot_id")?.into());
            planner.args.push("--component".into());
            planner.args.push(planner.req_str("component")?.into());
        }
        "synaptic_stdp_update" => {
            planner.args = vec!["memory".into(), "synaptic-stdp-update".into()];
            planner.args.push("--pre-node-id".into());
            planner.args.push(planner.req_str("pre_node_id")?.into());
            planner.args.push("--post-node-id".into());
            planner.args.push(planner.req_str("post_node_id")?.into());
            planner.args.push("--delta-t-ms".into());
            planner
                .args
                .push(planner.req_num("delta_t_ms")?.to_string());
        }
        "synaptic_prune_scale" => {
            planner.args = vec!["memory".into(), "synaptic-prune-scale".into()];
            planner.args.push("--prune-threshold".into());
            planner
                .args
                .push(planner.req_num("prune_threshold")?.to_string());
            planner.args.push("--target-activity".into());
            planner
                .args
                .push(planner.req_num("target_activity")?.to_string());
        }
        _ => return Ok(false),
    }
    Ok(true)
}
