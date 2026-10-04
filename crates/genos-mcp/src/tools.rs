use serde_json::Value;
use std::env;
mod base_specs;
mod catalog_tools;

struct ToolVisibility {
    lease: Option<Vec<String>>,
    disabled: Vec<String>,
    expose_all: bool,
}

fn configured_tool_set(variable: &str) -> Option<Vec<String>> {
    env::var(variable).ok().map(|value| {
        value
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(|name| {
                if name.starts_with("genos_") {
                    name.to_string()
                } else {
                    format!("genos_{name}")
                }
            })
            .collect()
    })
}

pub fn public_tool_specs() -> Vec<Value> {
    if lease_expired() {
        return Vec::new();
    }
    let lease = configured_tool_set("GENOS_MCP_LEASE");
    let disabled = configured_tool_set("GENOS_MCP_DISABLED_TOOLS").unwrap_or_default();

    let expose_requested = env_flag("GENOS_MCP_EXPOSE_ALL");
    let unsafe_production_exposure = env_flag("GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL");
    let node_env = env::var("NODE_ENV").ok();
    let expose_all = expose_all_allowed(
        expose_requested,
        node_env.as_deref(),
        unsafe_production_exposure,
    );

    let mut all_tools = base_specs::base_tool_specs();
    all_tools.extend(catalog_tools::bridged_catalog_specs());
    filter_visible_tools(
        all_tools,
        ToolVisibility {
            lease,
            disabled,
            expose_all,
        },
    )
}

fn filter_visible_tools(all_tools: Vec<Value>, visibility: ToolVisibility) -> Vec<Value> {
    match visibility.lease {
        Some(leased) => all_tools
            .into_iter()
            .filter(|tool| visible_under_lease(tool, &leased, &visibility.disabled))
            .collect(),
        None if visibility.expose_all => all_tools
            .into_iter()
            .filter(|tool| !is_disabled(tool, &visibility.disabled))
            .collect(),
        _ => Vec::new(),
    }
}

fn visible_under_lease(tool: &Value, leased: &[String], disabled: &[String]) -> bool {
    let name = tool_name(tool);
    !disabled.iter().any(|entry| entry == name) && leased.iter().any(|item| item == name)
}

fn is_disabled(tool: &Value, disabled: &[String]) -> bool {
    let name = tool_name(tool);
    disabled.iter().any(|entry| entry == name)
}

fn tool_name(tool: &Value) -> &str {
    tool.get("name").and_then(Value::as_str).unwrap_or("")
}

pub fn is_tool_allowed(name: &str) -> bool {
    if lease_expired() {
        return false;
    }
    public_tool_specs()
        .iter()
        .any(|tool| tool.get("name").and_then(Value::as_str) == Some(name))
}

pub fn is_tool_allowed_for_call(name: &str, args: &Value) -> bool {
    if !is_tool_allowed(name) {
        return false;
    }
    let Some(scope) = biological_feature_scope(name, args) else {
        return true;
    };
    let disabled = configured_tool_set("GENOS_MCP_DISABLED_TOOLS").unwrap_or_default();
    let Some(lease) = configured_tool_set("GENOS_MCP_LEASE") else {
        let exposed = env_flag("GENOS_MCP_EXPOSE_ALL")
            && expose_all_allowed(
                true,
                env::var("NODE_ENV").ok().as_deref(),
                env_flag("GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL"),
            );
        return capability_scope_granted(&scope, CapabilityLease {
            lease: None,
            disabled: &disabled,
            expose_all: exposed,
        });
    };
    capability_scope_granted(&scope, CapabilityLease {
        lease: Some(&lease),
        disabled: &disabled,
        expose_all: false,
    })
}

struct CapabilityLease<'a> {
    lease: Option<&'a [String]>,
    disabled: &'a [String],
    expose_all: bool,
}

fn capability_scope_granted(scope: &str, access: CapabilityLease<'_>) -> bool {
    if access.disabled.iter().any(|item| item == scope) {
        return false;
    }
    access.expose_all || access.lease.is_some_and(|items| items.iter().any(|item| item == scope))
}

fn biological_feature_scope(name: &str, args: &Value) -> Option<String> {
    if name != "genos_biomimicry" {
        return None;
    }
    let feature = args.get("feature")?.as_str()?.trim().to_ascii_lowercase();
    if feature.is_empty() {
        return None;
    }
    let canonical = match feature.as_str() {
        "electric_organ" => "electrocyte",
        "collar_cell" => "choanocyte",
        "structural_color" => "iridophore",
        "stomata" => "guard_cell",
        "xylem_wood" => "tracheid",
        "plasmid_hgt" => "prokaryote",
        _ => feature.as_str(),
    };
    let action = args.get("action")?.as_str()?.trim().to_ascii_lowercase();
    if action.is_empty() {
        return None;
    }
    Some(format!("genos_biomimicry::{canonical}::{action}"))
}

fn lease_expired() -> bool {
    let raw = match env::var("GENOS_MCP_LEASE_EXPIRES_AT") {
        Ok(value) => value,
        Err(_) => return false,
    };
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    lease_expired_at(Some(raw.as_str()), now_ms)
}

fn lease_expired_at(raw: Option<&str>, now_ms: i64) -> bool {
    let Some(raw) = raw else {
        return false;
    };
    let raw = raw.trim();
    if raw.is_empty() {
        return true;
    }
    let expires_at: i64 = match raw.parse() {
        Ok(value) => value,
        Err(_) => return true,
    };
    now_ms >= expires_at
}

fn env_flag(name: &str) -> bool {
    env::var(name).is_ok_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes"
        )
    })
}

fn expose_all_allowed(requested: bool, node_env: Option<&str>, unsafe_production: bool) -> bool {
    requested
        && (!node_env.is_some_and(|value| value.eq_ignore_ascii_case("production"))
            || unsafe_production)
}

#[cfg(test)]
mod lease_tests {
    use super::{biological_feature_scope, capability_scope_granted, CapabilityLease, catalog_tools::bridged_catalog_specs, expose_all_allowed, lease_expired_at};
    use serde_json::json;

    #[test]
    fn backend_bridged_tools_come_from_canonical_catalog() {
        let tools = bridged_catalog_specs();
        assert_eq!(tools.len(), 23);
        assert!(tools.iter().all(|tool| tool.get("inputSchema").is_some()));
    }

    #[test]
    fn lease_expires_at_the_boundary_and_invalid_values_fail_closed() {
        assert!(lease_expired_at(Some("1000"), 1000));
        assert!(!lease_expired_at(Some("1001"), 1000));
        assert!(lease_expired_at(Some("invalid"), 1000));
        assert!(!lease_expired_at(None, 1000));
        assert!(lease_expired_at(Some("  "), 1000));
    }

    #[test]
    fn exposure_is_disabled_by_default_and_guarded_in_production() {
        assert!(!expose_all_allowed(false, None, false));
        assert!(expose_all_allowed(true, Some("development"), false));
        assert!(!expose_all_allowed(true, Some("production"), false));
        assert!(expose_all_allowed(true, Some("production"), true));
    }

    #[test]
    fn specialized_biomimicry_calls_require_a_capability_scope() {
        assert_eq!(
            biological_feature_scope("genos_biomimicry", &json!({"feature":"electric_organ", "action":"discharge"})),
            Some("genos_biomimicry::electrocyte::discharge".into())
        );
        assert_eq!(
            biological_feature_scope("genos_biomimicry", &json!({"feature":"choanocyte", "action":"sift"})),
            Some("genos_biomimicry::choanocyte::sift".into())
        );
        for (feature, action, scope) in [
            ("iridophore", "render", "genos_biomimicry::iridophore::render"),
            ("guard_cell", "throttle", "genos_biomimicry::guard_cell::throttle"),
            ("tracheid", "transport", "genos_biomimicry::tracheid::transport"),
            ("prokaryote", "conjugate", "genos_biomimicry::prokaryote::conjugate"),
        ] {
            assert_eq!(
                biological_feature_scope("genos_biomimicry", &json!({"feature":feature, "action":action})),
                Some(scope.into())
            );
        }
        assert_eq!(
            biological_feature_scope("genos_biomimicry", &json!({"feature":"invented", "action":"run"})),
            Some("genos_biomimicry::invented::run".into())
        );
        assert_eq!(biological_feature_scope("genos_snapshot", &json!({"feature":"electrocyte", "action":"discharge"})), None);
    }

    #[test]
    fn specialized_capability_scope_is_exact_and_disable_overrides_grant() {
        let granted = vec!["genos_biomimicry::electrocyte::discharge".to_owned()];
        assert!(capability_scope_granted(&granted[0], CapabilityLease { lease: Some(&granted), disabled: &[], expose_all: false }));
        assert!(!capability_scope_granted("genos_biomimicry::electrocyte::recharge", CapabilityLease { lease: Some(&granted), disabled: &[], expose_all: false }));
        assert!(!capability_scope_granted(&granted[0], CapabilityLease { lease: Some(&granted), disabled: &granted, expose_all: false }));
        assert!(!capability_scope_granted(&granted[0], CapabilityLease { lease: None, disabled: &[], expose_all: false }));
        assert!(capability_scope_granted(&granted[0], CapabilityLease { lease: None, disabled: &[], expose_all: true }));
    }
}
