use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_resilience(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "parasitic_pressure" => {
            planner.args = vec!["eval".into(), "parasitism".into(), planner.req_str("input")?.into(), "--output".into(), planner.req_str("output")?.into()];
            if planner.opt_str("evolve")? == Some("true") { planner.args.push("--evolve".into()); }
        }
        "resilience_apoptosis" => {
            planner.args = vec!["resilience".into(), "apoptosis".into()];
            planner.args.push("--agent-id".into());
            planner.args.push(planner.req_str("agent_id")?.into());
        }
        "resilience_cryptobiosis" => {
            planner.args = vec!["resilience".into(), "cryptobiosis".into()];
            planner.args.push("--mode".into());
            planner.args.push(planner.req_str("mode")?.into());
        }
        "resilience_hypermutation" => {
            planner.args = vec!["resilience".into(), "hypermutation".into()];
            planner.args.push("--target".into());
            planner.args.push(planner.req_str("target")?.into());
        }
        "resilience_circuit_breaker" => {
            planner.args = vec!["resilience".into(), "circuit-breaker".into()];
            planner.args.push("--branch-id".into());
            planner.args.push(planner.req_str("branch_id")?.into());
        }
        _ => return Ok(false),
    }
    Ok(true)
}
