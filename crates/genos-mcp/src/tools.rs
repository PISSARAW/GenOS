use serde_json::Value;
use std::env;

fn configured_tool_set(variable: &str) -> Option<Vec<String>> {
    env::var(variable).ok().map(|value| {
        value.split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(|name| {
                if name.starts_with("genos_") { name.to_string() } else { format!("genos_{name}") }
            })
            .collect()
    })
}

fn raw_tools() -> Vec<Value> {
    let raw = include_str!("../../../shared/toolDefinitions.json");
    let parsed: Value = serde_json::from_str(raw).unwrap_or_default();
    parsed.get("tools").and_then(Value::as_array).cloned().unwrap_or_default()
}

pub fn public_tool_specs() -> Vec<Value> {
    let lease = configured_tool_set("GENOS_MCP_LEASE");
    let disabled = configured_tool_set("GENOS_MCP_DISABLED_TOOLS").unwrap_or_default();
    let expose_all = !matches!(
        env::var("GENOS_MCP_EXPOSE_ALL").as_deref(),
        Ok(value) if value == "0" || value.eq_ignore_ascii_case("false")
    );

    let all_tools = raw_tools();
    let filter_disabled = |tool: &Value| {
        let name = tool.get("name").and_then(Value::as_str).unwrap_or("");
        !disabled.iter().any(|entry| entry == name)
    };

    if let Some(ref leased) = lease {
        all_tools
            .into_iter()
            .filter(|t| {
                let name = t.get("name").and_then(Value::as_str).unwrap_or("");
                filter_disabled(t) && leased.iter().any(|l| l == name)
            })
            .collect()
    } else if expose_all {
        all_tools.into_iter().filter(filter_disabled).collect()
    } else {
        all_tools.into_iter().filter(filter_disabled).take(1).collect()
    }
}

pub fn is_tool_allowed(name: &str) -> bool {
    public_tool_specs().iter().any(|tool| {
        tool.get("name").and_then(Value::as_str) == Some(name)
    })
}
