pub mod canonical;
pub mod dev;
pub mod experiment;

use self::canonical::canonical_specs;
use self::dev::dev_specs;
use self::experiment::experiment_specs;
use crate::types::ToolSpec;

pub fn tool_specs() -> Vec<ToolSpec> {
    let mut specs = Vec::with_capacity(32);
    specs.extend(canonical_specs());
    specs.extend(experiment_specs());
    specs.extend(dev_specs());
    specs
}
