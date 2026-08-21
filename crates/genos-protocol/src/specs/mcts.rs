use crate::schema::{object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn mcts_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new(
            "mcts_introspect",
            "Introspect MCTS",
            "Introspect a specific node in the MCTS tree.",
        )
        .schema(object_schema(
            [("node_id", string_schema("The ID of the node to introspect"))],
            &["node_id"],
        ))
        .build(),
        SpecBuilder::new(
            "mcts_prune",
            "Prune MCTS Node",
            "Force prune a specific node in the MCTS tree.",
        )
        .schema(object_schema(
            [("node_id", string_schema("The ID of the node to prune"))],
            &["node_id"],
        ))
        .build(),
    ]
}
