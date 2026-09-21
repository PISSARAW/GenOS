use serde_json::Value;

pub(super) fn normalize_primitive_result(result: (i32, String)) -> (i32, String) {
    let (code, text) = result;
    if code != 0 { return (code, text); }
    match serde_json::from_str::<Value>(&text) {
        Ok(value) if value.get("success").and_then(Value::as_bool) == Some(true) => (0, text),
        Ok(value) if value.get("success").and_then(Value::as_bool) == Some(false) => (1, text),
        _ => (1, text),
    }
}

pub(super) fn normalize_cli_result(result: (i32, String)) -> (i32, String) {
    let (code, text) = result;
    if code != 0 { return (code, text); }
    match serde_json::from_str::<Value>(&text) {
        Ok(value) if value.get("success").and_then(Value::as_bool) == Some(false) => (1, text),
        _ => (0, text),
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_cli_result, normalize_primitive_result};

    #[test]
    fn primitive_failure_is_exposed_as_mcp_error() {
        assert_eq!(normalize_primitive_result((0, r#"{"success":false}"#.into())).0, 1);
        assert_eq!(normalize_primitive_result((0, r#"{"success":true}"#.into())).0, 0);
        assert_eq!(normalize_primitive_result((0, "legacy cli help".into())).0, 1);
        assert_eq!(normalize_cli_result((0, r#"{"success":false}"#.into())).0, 1);
    }
}
