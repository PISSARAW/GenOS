pub mod builder;
pub mod canonical;
pub mod dev;
pub mod experiment;
pub mod resilience;
pub mod biomimicry;

use serde_json::Value;

use self::builder::CommandPlanner;
use self::canonical::plan_canonical;
use self::dev::plan_dev;
use self::experiment::plan_experiment;
use self::resilience::plan_resilience;
use self::biomimicry::plan_biomimicry;
use crate::types::{PlannedCommand, ProtocolError};

pub fn plan_tool_call(name: &str, arguments: &Value) -> Result<PlannedCommand, ProtocolError> {
    let operation = name.strip_prefix("genos_").unwrap_or(name);
    let object = arguments
        .as_object()
        .ok_or_else(|| ProtocolError::InvalidInput {
            operation: operation.to_string(),
            message: "arguments must be an object".to_string(),
        })?;

    let mut planner = CommandPlanner::new(operation, object);

    if plan_canonical(&mut planner)?
        || plan_experiment(&mut planner)?
        || plan_dev(&mut planner)?
        || plan_resilience(&mut planner)?
        || plan_biomimicry(&mut planner)?
    {
        Ok(planner.finish())
    } else {
        Err(ProtocolError::UnknownTool(name.to_string()))
    }
}
