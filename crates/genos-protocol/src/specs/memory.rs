use crate::schema::{object_schema, string_schema, integer_schema, number_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn memory_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("inspect_manifest", "Inspect Manifest", "Inspect a Copy-on-Write memory manifest component.")
            .schema(object_schema([
                ("snapshot_id", string_schema("Snapshot ID")),
                ("component", string_schema("Component to inspect (genome, state, ssm)")),
            ], &["snapshot_id", "component"]))
            .build(),
        SpecBuilder::new("synaptic_stdp_update", "STDP Update", "Update associative edge weights based on STDP causal timing.")
            .schema(object_schema([
                ("pre_node_id", string_schema("Pre-synaptic node ID")),
                ("post_node_id", string_schema("Post-synaptic node ID")),
                ("delta_t_ms", integer_schema("Time delta (post - pre) in ms")),
            ], &["pre_node_id", "post_node_id", "delta_t_ms"]))
            .build(),
        SpecBuilder::new("synaptic_prune_scale", "Prune and Scale", "Execute homeostatic scaling and sleep-phase synaptic pruning.")
            .schema(object_schema([
                ("prune_threshold", number_schema("Minimum edge weight to retain")),
                ("target_activity", number_schema("Target incoming synaptic activity per node")),
            ], &["prune_threshold", "target_activity"]))
            .build(),
    ]
}
