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
        SpecBuilder::new("biomimicry_inject_pheromone", "Inject Pheromone", "Inject pheromones manually onto the spatial grid.")
            .schema(object_schema([
                ("node", string_schema("Target node identifier")),
                ("pheromone_type", string_schema("Type of pheromone to inject")),
                ("amount", string_schema("Amount of pheromone to inject"))
            ], &["node", "pheromone_type", "amount"]))
            .build(),
        SpecBuilder::new("biomimicry_genetic_sos", "Genetic SOS", "Trigger a genetic SOS response for an agent.")
            .schema(object_schema([("agent_id", string_schema("Agent identifier")), ("stress_level", string_schema("Stress level"))], &["agent_id", "stress_level"]))
            .build(),
        SpecBuilder::new("biomimicry_alter_plasmid", "Alter Plasmid", "Alter a plasmid for horizontal gene transfer.")
            .schema(object_schema([("plasmid_id", string_schema("Plasmid identifier")), ("payload", string_schema("New payload"))], &["plasmid_id", "payload"]))
            .build(),
        SpecBuilder::new("biomimicry_observe_gradient", "Observe Morphogenetic Gradient", "Observe the positional morphogenetic gradient of an agent.")
            .schema(object_schema([("agent_id", string_schema("Agent identifier"))], &["agent_id"]))
            .build(),
        SpecBuilder::new("biomimicry_manipulate_gradient", "Manipulate Morphogenetic Gradient", "Manipulate the positional morphogenetic gradient of an agent.")
            .schema(object_schema([
                ("agent_id", string_schema("Agent identifier")),
                ("gradient_value", string_schema("New gradient value (float)"))
            ], &["agent_id", "gradient_value"]))
            .build(),
        SpecBuilder::new("biomimicry_brier_consensus", "Brier Consensus", "Evaluate the Brier Consensus for a huddle topic.")
            .schema(object_schema([("topic", string_schema("Topic to evaluate"))], &["topic"]))
            .build(),
        SpecBuilder::new("biomimicry_alter_huddle", "Alter Huddle", "Inject a verified belief into a distributed huddle.")
            .schema(object_schema([
                ("topic", string_schema("Topic to alter")),
                ("agent_id", string_schema("Agent ID")),
                ("payload", string_schema("Hypothesis payload"))
            ], &["topic", "agent_id", "payload"]))
            .build(),
        SpecBuilder::new("biomimicry_cryptobiosis_force", "Force Cryptobiosis", "Forces an agent into Zstandard cryptobiosis state.")
            .schema(object_schema([("agent_id", string_schema("Agent ID to suspend"))], &["agent_id"]))
            .build(),
        SpecBuilder::new("biomimicry_ampk_alter", "Alter AMPK Charge", "Alters the Atkinson energy charge for an agent.")
            .schema(object_schema([
                ("agent_id", string_schema("Agent ID to target")),
                ("atp", string_schema("ATP value")),
                ("adp", string_schema("ADP value")),
                ("amp", string_schema("AMP value"))
            ], &["agent_id", "atp", "adp", "amp"]))
            .build(),
    ]
}
