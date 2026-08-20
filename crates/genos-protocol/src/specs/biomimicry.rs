use crate::schema::{object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn biomimicry_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("biomimicry_swarm_consensus", "Swarm Consensus", "Trigger swarm consensus evaluation.")
            .schema(object_schema([("target", string_schema("Consensus target"))], &["target"]))
            .build(),
        SpecBuilder::new("biomimicry_flocking_explore", "Flocking Explore", "Launch a boids-based heuristic exploration.")
            .schema(object_schema([("area", string_schema("Area to explore"))], &["area"]))
            .build(),
        SpecBuilder::new("biomimicry_network_quorum", "Network Quorum", "Evaluate network quorum state.")
            .schema(object_schema([("node", string_schema("Node identifier"))], &["node"]))
            .build(),
        SpecBuilder::new("biomimicry_distributed_huddle", "Distributed Huddle", "Sync a distributed huddle state.")
            .schema(object_schema([("state_file", string_schema("Path to huddle state file"))], &["state_file"]))
            .build(),
    ]
}
