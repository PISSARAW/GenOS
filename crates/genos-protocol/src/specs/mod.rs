pub mod canonical;
pub mod dev;
pub mod experiment;
pub mod resilience;
pub mod biomimicry;
pub mod hallucination;
pub mod security;
pub mod mcts;
pub mod evolution;
pub mod memory;

use self::canonical::canonical_specs;
use self::dev::dev_specs;
use self::experiment::experiment_specs;
use self::resilience::resilience_specs;
use self::biomimicry::biomimicry_specs;
use self::hallucination::hallucination_specs;
use self::security::security_specs;
use self::mcts::mcts_specs;
use self::evolution::evolution_specs;
use self::memory::memory_specs;
use crate::types::ToolSpec;

pub fn tool_specs() -> Vec<ToolSpec> {
    let mut specs = Vec::with_capacity(32);
    specs.extend(canonical_specs());
    specs.extend(experiment_specs());
    specs.extend(dev_specs());
    specs.extend(resilience_specs());
    specs.extend(biomimicry_specs());
    specs.extend(hallucination_specs());
    specs.extend(security_specs());
    specs.extend(mcts_specs());
    specs.extend(evolution_specs());
    specs.extend(memory_specs());
    specs
}
