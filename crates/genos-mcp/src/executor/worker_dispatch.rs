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
    use std::fs;
    use std::ffi::OsString;
    use std::path::PathBuf;
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    static BRIDGE_ENV_LOCK: Mutex<()> = Mutex::new(());

    struct BridgeEnvGuard(Option<OsString>);

    impl BridgeEnvGuard {
        fn isolate() -> Self {
            let previous = std::env::var_os("GENOS_ORCHESTRATOR_BRIDGE");
            unsafe { std::env::remove_var("GENOS_ORCHESTRATOR_BRIDGE") };
            Self(previous)
        }
    }

    impl Drop for BridgeEnvGuard {
        fn drop(&mut self) {
            match self.0.take() {
                Some(value) => unsafe { std::env::set_var("GENOS_ORCHESTRATOR_BRIDGE", value) },
                None => unsafe { std::env::remove_var("GENOS_ORCHESTRATOR_BRIDGE") },
            }
        }
    }

    struct BridgeWorkspace(PathBuf);

    impl BridgeWorkspace {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system clock")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "genos-mcp-worker-dispatch-{}-{nonce}",
                std::process::id()
            ));
            let bridge_dir = root.join("backend/bin");
            fs::create_dir_all(&bridge_dir).expect("create fake bridge directory");
            fs::write(
                bridge_dir.join("genos-orchestrate.cjs"),
                "process.stdout.write(JSON.stringify(JSON.parse(process.argv[2])));",
            )
            .expect("write fake orchestrator bridge");
            Self(root)
        }
    }

    impl Drop for BridgeWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

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

    #[test]
    fn delegate_worker_tool_call_reaches_orchestrator_bridge() {
        let _lock = BRIDGE_ENV_LOCK.lock().expect("bridge environment lock");
        let _bridge_env = BridgeEnvGuard::isolate();
        let workspace = BridgeWorkspace::new();
        let (code, output) = crate::executor::handle_tool_call(
            "genos_delegate_worker",
            &json!({ "mission": "inspect routing", "background": true, "role": "reviewer" }),
            &workspace.0,
        );
        assert_eq!(code, 0, "bridge output: {output}");
        let dispatched: serde_json::Value = serde_json::from_str(&output).expect("JSON bridge payload");
        assert_eq!(dispatched["action"], "dispatch_worker");
        assert_eq!(dispatched["background"], false);
        assert_eq!(dispatched["mission"], "inspect routing");
        assert_eq!(dispatched["role"], "reviewer");
    }

    #[test]
    fn worker_status_tool_call_reaches_scoped_orchestrator_action() {
        let _lock = BRIDGE_ENV_LOCK.lock().expect("bridge environment lock");
        let _bridge_env = BridgeEnvGuard::isolate();
        let workspace = BridgeWorkspace::new();
        let (code, output) = crate::executor::handle_tool_call(
            "genos_worker_status",
            &json!({ "orchestrator_id": "root-agent", "worker_id": "worker-17" }),
            &workspace.0,
        );
        assert_eq!(code, 0, "bridge output: {output}");
        let dispatched: serde_json::Value = serde_json::from_str(&output).expect("JSON bridge payload");
        assert_eq!(dispatched["action"], "worker_status");
        assert_eq!(dispatched["orchestrator_id"], "root-agent");
        assert_eq!(dispatched["worker_id"], "worker-17");
    }
}
