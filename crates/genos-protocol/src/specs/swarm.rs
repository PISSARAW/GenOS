use crate::schema::{object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn swarm_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new(
            "swarm_assign",
            "Assign task to swarm",
            "Submit a task to the parking-lot swarm. If all MAX_SLOTS slots are occupied, the oldest active slot is suspended into the parking lot before the new agent is assigned. Returns the active slot and any evicted slot.",
        )
        .schema(object_schema(
            [
                ("agent_id", string_schema("Agent identifier (backend | frontend | qa or custom).")),
                ("task_id", string_schema("Unique task identifier.")),
                ("task_text", string_schema("Human-readable task description.")),
            ],
            &["agent_id", "task_id", "task_text"],
        ))
        .build(),
        SpecBuilder::new(
            "swarm_park",
            "Park active agent",
            "Manually suspend an active agent slot into the parking lot, freeing its slot for a new assignment.",
        )
        .schema(object_schema(
            [("agent_id", string_schema("Agent identifier to park."))],
            &["agent_id"],
        ))
        .build(),
        SpecBuilder::new(
            "swarm_wake",
            "Wake parked agent",
            "Reactivate a parked agent by identifier, moving it from the parking lot back into an active slot.",
        )
        .schema(object_schema(
            [("agent_id", string_schema("Agent identifier to reactivate."))],
            &["agent_id"],
        ))
        .build(),
        SpecBuilder::new(
            "swarm_status",
            "Swarm status",
            "Read-only snapshot of the current swarm state: active slots, parking lot, and slot capacity.",
        )
        .schema(object_schema([], &[]))
        .read_only()
        .build(),
    ]
}
