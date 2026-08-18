use serde_json::{json, Value};

use crate::schema::result_schema;
use crate::types::{ToolAnnotations, ToolSpec, PROTOCOL_VERSION};

pub struct SpecBuilder {
    spec: ToolSpec,
}

impl SpecBuilder {
    pub fn new(operation: &str, title: &str, description: &str) -> Self {
        Self {
            spec: ToolSpec {
                name: format!("genos_{operation}"),
                title: title.to_string(),
                description: description.to_string(),
                input_schema: json!({}),
                output_schema: result_schema(),
                annotations: ToolAnnotations {
                    read_only_hint: false,
                    destructive_hint: false,
                    idempotent_hint: false,
                    open_world_hint: false,
                },
                meta: json!({"genos/protocolVersion": PROTOCOL_VERSION}),
            },
        }
    }

    pub fn schema(mut self, schema: Value) -> Self {
        self.spec.input_schema = schema;
        self
    }

    pub fn read_only(mut self) -> Self {
        self.spec.annotations.read_only_hint = true;
        self.spec.annotations.idempotent_hint = true;
        self
    }

    pub fn destructive(mut self) -> Self {
        self.spec.annotations.destructive_hint = true;
        self
    }

    pub fn open_world(mut self) -> Self {
        self.spec.annotations.open_world_hint = true;
        self
    }

    pub fn build(self) -> ToolSpec {
        self.spec
    }
}
