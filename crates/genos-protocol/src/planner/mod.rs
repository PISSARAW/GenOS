pub mod biomimicry;
pub mod builder;
pub mod canonical;
pub mod dev;
pub mod evolution;
pub mod experiment;
pub mod hallucination;
pub mod mcts;
pub mod memory;
pub mod resilience;
pub mod security;

use serde_json::Value;

use self::biomimicry::plan_biomimicry;
use self::builder::CommandPlanner;
use self::canonical::plan_canonical;
use self::dev::plan_dev;
use self::evolution::plan_evolution;
use self::experiment::plan_experiment;
use self::hallucination::plan_hallucination;
use self::mcts::plan_mcts;
use self::memory::plan_memory;
use self::resilience::plan_resilience;
use self::security::plan_security;
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
        || plan_hallucination(&mut planner)?
        || plan_security(&mut planner)?
        || plan_mcts(&mut planner)?
        || plan_evolution(&mut planner)?
        || plan_memory(&mut planner)?
    {
        Ok(planner.finish())
    } else {
        Err(ProtocolError::UnknownTool(name.to_string()))
    }
}
