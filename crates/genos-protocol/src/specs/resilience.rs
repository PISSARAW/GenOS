use crate::schema::{object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn resilience_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("resilience_apoptosis", "Trigger Apoptosis", "Gracefully shutdown an agent to prevent state corruption.")
            .schema(object_schema([("agent_id", string_schema("Agent identifier"))], &["agent_id"]))
            .build(),
        SpecBuilder::new("resilience_cryptobiosis", "Trigger Cryptobiosis", "Put the environment in offline stasis mode.")
            .schema(object_schema([("mode", string_schema("Cryptobiosis mode (e.g. offline, stasis)"))], &["mode"]))
            .build(),
        SpecBuilder::new("resilience_hypermutation", "Trigger Hypermutation", "Trigger hypermutation fuzzing on a target.")
            .schema(object_schema([("target", string_schema("Target to fuzz"))], &["target"]))
            .build(),
        SpecBuilder::new("resilience_circuit_breaker", "Trigger Circuit Breaker", "Cut off a runaway counterfactual branch.")
            .schema(object_schema([("branch_id", string_schema("Branch identifier"))], &["branch_id"]))
            .build(),
    ]
}
