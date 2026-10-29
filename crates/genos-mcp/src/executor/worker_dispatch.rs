use serde_json::{Value, json};

fn with_action(args: &Value, action: &str) -> Value {
    let mut payload = args.clone();
    if let Some(object) = payload.as_object_mut() {
        object.insert("action".into(), json!(action));
    }
    payload
}

pub(super) fn delegate_payload(args: &Value) -> Value {
    let mut payload = with_action(args, "dispatch_worker");
    if let Some(object) = payload.as_object_mut() {
        object.insert("background".into(), json!(false));
    }
    payload
}

pub(super) fn status_payload(args: &Value) -> Value {
    with_action(args, "worker_status")
}

#[cfg(test)]
mod tests {
    use super::{delegate_payload, status_payload};
    use serde_json::json;

    #[test]
    fn delegate_worker_maps_to_bounded_synchronous_dispatch() {
        let payload = delegate_payload(&json!({ "mission": "inspect routing", "background": true }));
        assert_eq!(payload["action"], "dispatch_worker");
        assert_eq!(payload["background"], false);
        assert_eq!(payload["mission"], "inspect routing");
    }

    #[test]
    fn worker_status_preserves_scope_for_orchestrator_read() {
        let payload = status_payload(&json!({ "orchestrator_id": "root-agent", "worker_id": "worker-17" }));
        assert_eq!(payload["action"], "worker_status");
        assert_eq!(payload["orchestrator_id"], "root-agent");
        assert_eq!(payload["worker_id"], "worker-17");
    }
}
