use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_security(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "configure_gateway" | "genos_configure_gateway" => {
            planner.args = vec!["security".into(), "configure-gateway".into()];
            let threshold = planner
                .object
                .get("threshold")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| planner.invalid("missing threshold"))?;
            planner.args.push("--threshold".into());
            planner.args.push(threshold.to_string());
            let cooldown = planner
                .object
                .get("cooldown_ms")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| planner.invalid("missing cooldown_ms"))?;
            planner.args.push("--cooldown-ms".into());
            planner.args.push(cooldown.to_string());
        }
        "inject_crispr_spacer" | "genos_inject_crispr_spacer" => {
            planner.args = vec!["security".into(), "inject-crispr-spacer".into()];
            planner.args.push("--spacer-signature".into());
            planner
                .args
                .push(planner.req_str("spacer_signature")?.into());
        }
        _ => return Ok(false),
    }
    Ok(true)
}
