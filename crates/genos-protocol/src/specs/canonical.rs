use serde_json::json;

use crate::schema::{capsule_schema, object_schema, root_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn canonical_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("create", "Create agent genome", "Create a provider-neutral GenOS agent genome.")
            .schema(object_schema(
                [
                    ("name", string_schema("Stable agent name.")),
                    ("role", string_schema("Agent role.")),
                    ("out", string_schema("Optional output file path.")),
                ],
                &["name", "role"],
            ))
            .build(),
        SpecBuilder::new("snapshot", "Snapshot capsule", "Checkpoint an atomic agent-world capsule.")
            .schema(capsule_schema())
            .build(),
        SpecBuilder::new("restore", "Restore capsule", "Restore a paused agent-world capsule into a live isolated world.")
            .schema(capsule_schema())
            .build(),
        SpecBuilder::new("fork", "Fork capsule", "Create isolated counterfactual descendants from an agent-world capsule.")
            .schema(object_schema(
                [
                    ("capsule_id", string_schema("Parent capsule identifier.")),
                    (
                        "branches",
                        json!({
                            "type": "array",
                            "minItems": 1,
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "properties": {
                                    "label": {"type": "string", "minLength": 1},
                                    "hypothesis": {"type": "string", "minLength": 1}
                                },
                                "required": ["label", "hypothesis"]
                            }
                        }),
                    ),
                    ("root", root_schema()),
                ],
                &["capsule_id", "branches"],
            ))
            .build(),
        SpecBuilder::new("run", "Run in capsule", "Execute one explicitly requested command in a capsule's isolated world. This consumes budget and may change files.")
            .schema(object_schema(
                [
                    ("capsule_id", string_schema("Capsule identifier.")),
                    ("command", string_schema("Command to execute in the isolated world.")),
                    ("root", root_schema()),
                    ("allow_failure", json!({"type": "boolean", "default": false})),
                ],
                &["capsule_id", "command"],
            ))
            .destructive()
            .open_world()
            .build(),
        SpecBuilder::new("inspect", "Inspect agent", "Read and validate a GenOS agent genome.")
            .schema(object_schema(
                [("path", string_schema("Agent genome path."))],
                &["path"],
            ))
            .read_only()
            .build(),
        SpecBuilder::new("diff", "Diff snapshots", "Compare two logical GenOS snapshots without changing them.")
            .schema(object_schema(
                [
                    ("a", string_schema("Left snapshot path or identifier.")),
                    ("b", string_schema("Right snapshot path or identifier.")),
                    ("root", root_schema()),
                    ("store", string_schema("Optional snapshot store path.")),
                ],
                &["a", "b"],
            ))
            .read_only()
            .build(),
        SpecBuilder::new("lineage", "Inspect lineage", "Read the snapshot lineage DAG, optionally anchored at one snapshot.")
            .schema(object_schema(
                [
                    ("snapshot", string_schema("Optional snapshot path or identifier.")),
                    ("root_snapshot", string_schema("Optional root snapshot identifier.")),
                    ("root", root_schema()),
                ],
                &[],
            ))
            .read_only()
            .build(),
        SpecBuilder::new("replay", "Replay events", "Reconstruct agent state from the GenOS event stream.")
            .schema(object_schema(
                [
                    ("snapshot", string_schema("Optional snapshot path or identifier.")),
                    ("branch_id", string_schema("Optional branch identifier.")),
                    ("root", root_schema()),
                ],
                &[],
            ))
            .read_only()
            .build(),
        SpecBuilder::new("merge", "Merge branch knowledge", "Run the evidence-aware cognitive merge described by a manifest.")
            .schema(object_schema(
                [("manifest", string_schema("Cognitive merge manifest path."))],
                &["manifest"],
            ))
            .build(),
        SpecBuilder::new("conditional_merge", "Conditionally merge branch", "Evaluate conditions (cost, tests, security) and merge branch if passed.")
            .schema(object_schema(
                [
                    ("branch_id", string_schema("Branch ID to evaluate and merge.")),
                    ("conditions", string_schema("Conditions to evaluate.")),
                ],
                &["branch_id", "conditions"],
            ))
            .build(),
        SpecBuilder::new("export_audit", "Export audit bundle", "Export a complete audit bundle for a given snapshot.")
            .schema(object_schema(
                [
                    ("snapshot_id", string_schema("Snapshot ID to audit.")),
                    ("output", string_schema("Output file path.")),
                ],
                &["snapshot_id", "output"],
            ))
            .build(),
    ]
}
