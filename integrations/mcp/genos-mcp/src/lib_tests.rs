#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use std::sync::Mutex;
    use tokio::io::{duplex, split, AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tower::ServiceExt;

    #[derive(Clone)]
    struct FakeExecutor {
        output: ExecutionOutput,
    }

    #[derive(Clone)]
    struct CapturingExecutor {
        args: Arc<Mutex<Vec<String>>>,
    }

    #[async_trait]
    impl CommandExecutor for FakeExecutor {
        async fn execute(&self, _args: &[String]) -> anyhow::Result<ExecutionOutput> {
            Ok(self.output.clone())
        }
    }

    #[async_trait]
    impl CommandExecutor for CapturingExecutor {
        async fn execute(&self, args: &[String]) -> anyhow::Result<ExecutionOutput> {
            *self.args.lock().unwrap() = args.to_vec();
            Ok(ExecutionOutput {
                exit_code: 0,
                stdout: "{}".into(),
                stderr: String::new(),
            })
        }
    }

    fn server() -> McpServer {
        McpServer::new(Arc::new(FakeExecutor {
            output: ExecutionOutput {
                exit_code: 0,
                stdout: "{\"valid\":true}\n".into(),
                stderr: String::new(),
            },
        }))
    }

    #[tokio::test]
    async fn initialize_advertises_tools_and_instructions() {
        let response = server()
            .handle(json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2025-03-26"}
            }))
            .await
            .unwrap();
        assert_eq!(response["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(
            response["result"]["capabilities"]["tools"]["listChanged"],
            false
        );
        assert!(response["result"]["instructions"]
            .as_str()
            .unwrap()
            .starts_with("GenOS versions"));
    }

    #[tokio::test]
    async fn tool_call_returns_versioned_structured_content() {
        let response = server()
            .handle(json!({
                "jsonrpc": "2.0",
                "id": "call-1",
                "method": "tools/call",
                "params": {"name": "genos_orchestrate", "arguments": {"operation": "inspect", "arguments": {"path": "agent.yaml"}}}
            }))
            .await
            .unwrap();
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(
            response["result"]["structuredContent"]["protocol_version"],
            genos_protocol::PROTOCOL_VERSION
        );
        assert_eq!(
            response["result"]["structuredContent"]["output"]["valid"],
            true
        );
    }

    #[tokio::test]
    async fn initial_orchestration_returns_an_async_acceptance_request() {
        let args = Arc::new(Mutex::new(Vec::new()));
        let server = McpServer::new(Arc::new(CapturingExecutor { args: args.clone() }));
        let response = server
            .handle(json!({
                "jsonrpc": "2.0",
                "id": "start-1",
                "method": "tools/call",
                "params": {"name": "genos_orchestrate", "arguments": {"task": "Check startup"}}
            }))
            .await
            .unwrap();

        assert_eq!(response["result"]["isError"], false);
        let captured = args.lock().unwrap();
        assert_eq!(captured[0], "__genos_backend_orchestrate__");
        let request: Value = serde_json::from_str(&captured[1]).unwrap();
        assert_eq!(request["background"], true);
    }

    #[test]
    fn worker_authority_is_case_insensitive_and_explicit() {
        assert!(worker_authority(Some("worker")));
        assert!(worker_authority(Some(" Worker ")));
        assert!(!worker_authority(Some("orchestrator")));
        assert!(!worker_authority(None));
    }

    #[test]
    fn worker_delegation_tool_is_orchestrator_only_and_mission_named() {
        let tool = delegate_worker_tool();
        assert_eq!(tool.name, "genos_delegate_worker");
        assert_eq!(tool.meta["genos/authority"], "orchestrator");
        assert_eq!(tool.input_schema["required"], json!(["mission"]));
    }

    #[test]
    fn a_team_tool_requires_multiple_domains_and_orchestrator_authority() {
        let tool = a_team_tool();
        assert_eq!(tool.name, "genos_a_team_preview");
        assert_eq!(tool.meta["genos/authority"], "orchestrator");
        assert_eq!(
            tool.input_schema["properties"]["sub_systems"]["minItems"],
            2
        );
        assert_eq!(
            tool.input_schema["properties"]["sub_systems"]["maxItems"],
            3
        );
    }

    #[test]
    fn trinity_tool_requires_a_concrete_shared_mission() {
        let tool = trinity_tool();
        assert_eq!(tool.name, "genos_trinity_launch");
        assert_eq!(tool.meta["genos/authority"], "orchestrator");
        assert_eq!(tool.input_schema["required"], json!(["mission"]));
    }

    #[test]
    fn strategy_change_tool_requires_need_reason_and_orchestrator_authority() {
        let tool = change_strategy_tool();
        assert_eq!(tool.name, "genos_change_strategy");
        assert_eq!(tool.meta["genos/authority"], "orchestrator");
        assert_eq!(tool.input_schema["required"], json!(["need", "reason"]));
    }

    #[test]
    fn progress_tool_is_user_facing_and_orchestrator_only() {
        let tool = report_progress_tool();
        assert_eq!(tool.name, "genos_report_progress");
        assert_eq!(tool.meta["genos/authority"], "orchestrator");
        assert_eq!(tool.meta["genos/audience"], "user");
        assert_eq!(tool.input_schema["required"], json!(["phase", "message"]));
    }

    #[test]
    fn organization_tools_separate_orchestrator_authority_from_worker_communication() {
        let change = change_organization_tool();
        assert_eq!(change.meta["genos/authority"], "orchestrator");
        assert_eq!(
            change.input_schema["required"],
            json!(["organization", "reason"])
        );
        let publish = worker_publish_tool();
        assert_eq!(publish.meta["genos/authority"], "orchestrator_or_worker");
        assert_eq!(publish.input_schema["required"], json!(["kind", "content"]));
        assert_eq!(organization_state_tool().annotations.read_only_hint, true);
        assert_eq!(worker_inbox_tool().annotations.read_only_hint, true);
    }

    #[test]
    fn preauthorized_leased_run_is_non_destructive_but_still_exactly_scoped() {
        let allowed = vec!["node --test smoke.test.js".to_string()];
        let mut tool = tool_specs()
            .into_iter()
            .find(|tool| tool.name == "genos_run")
            .unwrap();
        assert!(tool.annotations.destructive_hint);
        assert!(tool.annotations.open_world_hint);

        mark_preauthorized_run(&mut tool, &allowed);
        assert!(!tool.annotations.destructive_hint);
        assert!(!tool.annotations.open_world_hint);
        assert_eq!(tool.meta["genos/preauthorized"], true);
        assert_eq!(
            leased_run_authorization_error(
                "genos_run",
                &json!({"command": "node --test smoke.test.js"}),
                true,
                &allowed
            ),
            None
        );
        assert!(leased_run_authorization_error(
            "genos_run",
            &json!({"command": "node --test hidden.test.js"}),
            true,
            &allowed
        )
        .unwrap()
        .contains("outside this agent's explicit execution allowlist"));
    }

    #[tokio::test]
    async fn stdio_transport_uses_one_json_rpc_message_per_line() {
        let (client, server_io) = duplex(16 * 1024);
        let (client_read, mut client_write) = split(client);
        let (server_read, server_write) = split(server_io);
        let task = tokio::spawn(serve_stdio(server_read, server_write, server()));

        client_write
            .write_all(b"{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"ping\"}\n")
            .await
            .unwrap();
        let mut line = String::new();
        BufReader::new(client_read)
            .read_line(&mut line)
            .await
            .unwrap();
        let response: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(response["id"], 7);
        drop(client_write);
        task.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn http_transport_accepts_json_rpc_posts() {
        let response = http_router(server())
            .oneshot(
                Request::post("/mcp")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"jsonrpc":"2.0","id":9,"method":"tools/list"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let value: Value = serde_json::from_slice(&body).unwrap();
        let tools = value["result"]["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "genos_orchestrate");
    }
}
