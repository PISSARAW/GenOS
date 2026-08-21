use crate::schema::{object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;
use serde_json::json;

pub fn integer_schema(description: &str) -> serde_json::Value {
    json!({"type": "integer", "description": description})
}

pub fn security_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("genos_configure_gateway", "Configure Tool Gateway", "Configures the Half-Open circuit breaker for the Tool Gateway.")
            .schema(object_schema([
                ("threshold", integer_schema("Failure threshold before opening circuit")),
                ("cooldown_ms", integer_schema("Cooldown period in milliseconds"))
            ], &["threshold", "cooldown_ms"]))
            .build(),
        SpecBuilder::new("genos_inject_crispr_spacer", "Inject CRISPR Spacer", "Injects an adversarial spacer footprint to block malicious payloads.")
            .schema(object_schema([("spacer_signature", string_schema("The spacer signature to block"))], &["spacer_signature"]))
            .build(),
    ]
}
