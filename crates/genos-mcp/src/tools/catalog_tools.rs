use serde_json::{Value, from_str};

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
                .is_some_and(crate::executor::backend_dispatch::is_bridged_tool)
        })
        .cloned()
        .collect()
}
