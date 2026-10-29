use serde_json::{Value, from_str};
use std::collections::HashSet;
use std::sync::OnceLock;

struct RustCatalogRoutes { backend: HashSet<String>, orchestrator: HashSet<String> }

fn rust_catalog_routes() -> &'static RustCatalogRoutes {
    static ROUTES: OnceLock<RustCatalogRoutes> = OnceLock::new();
    ROUTES.get_or_init(|| {
        let catalog: Value = from_str(include_str!("../../../../shared/toolDefinitions.json"))
            .expect("canonical MCP catalog must be valid JSON");
        let mut routes = RustCatalogRoutes { backend: HashSet::new(), orchestrator: HashSet::new() };
        for tool in catalog.get("tools").and_then(Value::as_array).into_iter().flatten() {
            let (Some(name), Some(route)) = (
                tool.get("name").and_then(Value::as_str),
                tool.get("x-genos-rust-route").and_then(Value::as_str),
            ) else { continue; };
            let target = match route {
                "backend" => &mut routes.backend,
                "orchestrator" => &mut routes.orchestrator,
                _ => continue,
            };
            target.insert(name.to_string());
        }
        routes
    })
}

pub(crate) fn is_backend_routed_tool(name: &str) -> bool {
    rust_catalog_routes().backend.contains(name)
}

fn is_orchestrator_routed_tool(name: &str) -> bool {
    rust_catalog_routes().orchestrator.contains(name)
}

pub(super) fn routed_catalog_specs() -> Vec<Value> {
    let catalog: Value = from_str(include_str!("../../../../shared/toolDefinitions.json"))
        .expect("canonical MCP catalog must be valid JSON");
    catalog.get("tools").and_then(Value::as_array).into_iter().flatten()
        .filter(|tool| tool.get("name").and_then(Value::as_str).is_some_and(|name|
            is_backend_routed_tool(name) || is_orchestrator_routed_tool(name)))
        .cloned().collect()
}

pub(super) fn bridged_catalog_specs() -> Vec<Value> {
    let catalog: Value = from_str(include_str!("../../../../shared/toolDefinitions.json"))
        .expect("canonical MCP catalog must be valid JSON");
    catalog.get("tools").and_then(Value::as_array).into_iter().flatten()
        .filter(|tool| tool.get("name").and_then(Value::as_str).is_some_and(is_backend_routed_tool))
        .cloned().collect()
}
