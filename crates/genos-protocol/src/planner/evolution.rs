use crate::planner::builder::CommandPlanner;
use crate::types::ProtocolError;

pub fn plan_evolution(planner: &mut CommandPlanner) -> Result<bool, ProtocolError> {
    match planner.operation {
        "evolution_assimilate_plasmid" => {
            planner.args = vec!["evolution".into(), "assimilate-plasmid".into()];
            planner.args.push("--plasmid-id".into());
            planner.args.push(planner.req_str("plasmid_id")?.into());
        }
        "evolution_set_entropy_threshold" => {
            planner.args = vec!["evolution".into(), "set-entropy-threshold".into()];
            planner.push_number("threshold", "--threshold")?;
        }
        _ => return Ok(false),
    }
    Ok(true)
}
