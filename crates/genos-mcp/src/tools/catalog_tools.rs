use serde_json::{from_str, Value};

const BRIDGED_TOOLS: &[&str] = &[
    "genos_execute_strategy_pipeline",
    "genos_fossil_record",
    "genos_fossil_list",
    "genos_fossil_strata",
    "genos_fossil_excavate",
    "genos_fossil_decode",
    "genos_fossil_candidate",
    "genos_topology_session",
    "genos_signal_publish",
    "genos_signal_read",
    "genos_signal_purge",
    "genos_signal_ground",
    "genos_signal_electrocyte_vote",
    "genos_signal_chemotactic_follow",
    "genos_signal_plasmid_transfer",
    "genos_signal_collective_decision",
    "genos_search_failures",
    "genos_diagnose",
    "genos_analyze_trajectory",
    "genos_record_decision",
    "genos_record_experience",
    "genos_compile_memory",
    "genos_blame",
];

pub(super) fn bridged_catalog_specs() -> Vec<Value> {
    let catalog: Value = from_str(include_str!("../../../../shared/toolDefinitions.json"))
        .expect("canonical MCP catalog must be valid JSON");
    catalog
        .get("tools")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|tool| {
            tool.get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| BRIDGED_TOOLS.contains(&name))
        })
        .cloned()
        .collect()
}
