impl McpServer {
    async fn call_tool(&self, id: Value, params: Option<&Value>) -> Value {
        if halt_file_exists() {
            return tool_error(id, "GenOS MCP is halted by the control plane.".into());
        }
        let Some(params) = params.and_then(Value::as_object) else {
            return error_response(id, -32602, "tools/call params must be an object");
        };
        let Some(name) = params.get("name").and_then(Value::as_str) else {
            return error_response(id, -32602, "tools/call requires a tool name");
        };
        let arguments = params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let lease = leased_operations();
        if let Some(error) = leased_run_authorization_error(
            name,
            &arguments,
            lease.is_some(),
            &configured_allowed_commands(),
        ) {
            return tool_error(id, error);
        }
        if name == "genos_orchestrate"
            && arguments.get("operation").is_none()
            && running_as_worker()
        {
            return tool_error(
                id,
                "GenOS worker recursion blocked: a delegated worker cannot create a root orchestrator; return evidence to the owning orchestrator instead.".into(),
            );
        }
        if matches!(
            name,
            "genos_delegate_worker"
                | "genos_a_team_preview"
                | "genos_trinity_launch"
                | "genos_change_strategy"
                | "genos_report_progress"
                | "genos_change_organization"
        ) && running_as_worker()
        {
            return tool_error(
                id,
                "GenOS worker authority blocked: only the owning orchestrator may dispatch workers or change their organization.".into(),
            );
        }
        if let Some(lease) = lease {
            if !lease.contains(&name.to_string()) {
                return tool_error(
                    id,
                    format!("Tool '{name}' is outside this worker's GenOS lease."),
                );
            }
        }
        let (operation_name, operation_arguments) = if name == "genos_report_progress" {
            let Some(message) = arguments
                .get("message")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
            else {
                return tool_error(
                    id,
                    "genos_report_progress requires a user-facing message.".into(),
                );
            };
            let Some(orchestrator_id) = env::var("GENOS_ORCHESTRATOR_AGENT_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
            else {
                return tool_error(
                    id,
                    "genos_report_progress requires an orchestrator authority ID.".into(),
                );
            };
            let mut request = arguments;
            if let Some(object) = request.as_object_mut() {
                object.insert("action".into(), Value::String("report_progress".into()));
                object.insert("message".into(), Value::String(message));
                object.insert("orchestratorId".into(), Value::String(orchestrator_id));
                object.insert("background".into(), Value::Bool(false));
            }
            ("__genos_backend_orchestrate__".to_string(), request)
        } else if name == "genos_change_strategy" {
            let Some(need) = arguments
                .get("need")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
            else {
                return tool_error(id, "genos_change_strategy requires a current need.".into());
            };
            let Some(reason) = arguments
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
            else {
                return tool_error(
                    id,
                    "genos_change_strategy requires an evidence-backed reason.".into(),
                );
            };
            let Some(orchestrator_id) = env::var("GENOS_ORCHESTRATOR_AGENT_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
            else {
                return tool_error(
                    id,
                    "genos_change_strategy requires an orchestrator authority ID.".into(),
                );
            };
            let mut request = arguments;
            if let Some(object) = request.as_object_mut() {
                object.insert("action".into(), Value::String("change_strategy".into()));
                object.insert("need".into(), Value::String(need));
                object.insert("reason".into(), Value::String(reason));
                object.insert("orchestratorId".into(), Value::String(orchestrator_id));
                object.insert("background".into(), Value::Bool(false));
            }
            ("__genos_backend_orchestrate__".to_string(), request)
        } else if name == "genos_change_organization" {
            let Some(organization) = arguments
                .get("organization")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
            else {
                return tool_error(
                    id,
                    "genos_change_organization requires an organization.".into(),
                );
            };
            let Some(reason) = arguments
                .get("reason")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
            else {
                return tool_error(
                    id,
                    "genos_change_organization requires an evidence-backed reason.".into(),
                );
            };
            let Some(orchestrator_id) = env::var("GENOS_ORCHESTRATOR_AGENT_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
            else {
                return tool_error(
                    id,
                    "genos_change_organization requires an orchestrator authority ID.".into(),
                );
            };
            let mut request = arguments;
            if let Some(object) = request.as_object_mut() {
                object.insert("action".into(), Value::String("change_organization".into()));
                object.insert("organization".into(), Value::String(organization));
                object.insert("reason".into(), Value::String(reason));
                object.insert("orchestratorId".into(), Value::String(orchestrator_id));
                object.insert("background".into(), Value::Bool(false));
            }
            ("__genos_backend_orchestrate__".to_string(), request)
        } else if matches!(
            name,
            "genos_organization_state" | "genos_worker_publish" | "genos_worker_inbox"
        ) {
            let Some(orchestrator_id) = env::var("GENOS_ORCHESTRATOR_AGENT_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
            else {
                return tool_error(id, format!("{name} requires an orchestrator authority ID."));
            };
            let Some(agent_id) = env::var("GENOS_AGENT_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
            else {
                return tool_error(id, format!("{name} requires a leased agent identity."));
            };
            if name == "genos_worker_publish" {
                let content_present = arguments
                    .get("content")
                    .and_then(Value::as_str)
                    .is_some_and(|value| !value.trim().is_empty());
                if !content_present {
                    return tool_error(
                        id,
                        "genos_worker_publish requires non-empty content.".into(),
                    );
                }
            }
            let mut request = arguments;
            if let Some(object) = request.as_object_mut() {
                let action = match name {
                    "genos_organization_state" => "organization_state",
                    "genos_worker_publish" => "organization_publish",
                    _ => "organization_inbox",
                };
                object.insert("action".into(), Value::String(action.into()));
                object.insert("orchestratorId".into(), Value::String(orchestrator_id));
                object.insert("requesterAgentId".into(), Value::String(agent_id.clone()));
                object.insert("senderAgentId".into(), Value::String(agent_id));
                object.insert("background".into(), Value::Bool(false));
            }
            ("__genos_backend_orchestrate__".to_string(), request)
        } else if name == "genos_trinity_launch" {
            let Some(mission) = arguments
                .get("mission")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
            else {
                return tool_error(
                    id,
                    "genos_trinity_launch requires a concrete mission.".into(),
                );
            };
            let Some(orchestrator_id) = env::var("GENOS_ORCHESTRATOR_AGENT_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
            else {
                return tool_error(
                    id,
                    "genos_trinity_launch requires an orchestrator authority ID.".into(),
                );
            };
            let mut request = arguments;
            if let Some(object) = request.as_object_mut() {
                object.insert("action".into(), Value::String("dispatch_trinity".into()));
                object.insert("mission".into(), Value::String(mission));
                object.insert("orchestratorId".into(), Value::String(orchestrator_id));
                object.insert("background".into(), Value::Bool(false));
                if let Ok(workspace) = env::var("GENOS_WORKSPACE_ROOT") {
                    object.insert("workspace_root".into(), Value::String(workspace));
                }
            }
            ("__genos_backend_orchestrate__".to_string(), request)
        } else if name == "genos_a_team_preview" {
            let Some(project_goal) = arguments
                .get("project_goal")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
            else {
                return tool_error(id, "genos_a_team_preview requires project_goal.".into());
            };
            let sub_system_count = arguments
                .get("sub_systems")
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or(0);
            if !(2..=3).contains(&sub_system_count) {
                return tool_error(
                    id,
                    "genos_a_team_preview requires two or three subsystems.".into(),
                );
            }
            let Some(orchestrator_id) = env::var("GENOS_ORCHESTRATOR_AGENT_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
            else {
                return tool_error(
                    id,
                    "genos_a_team_preview requires an orchestrator authority ID.".into(),
                );
            };
            let mut request = arguments;
            if let Some(object) = request.as_object_mut() {
                object.insert("action".into(), Value::String("dispatch_team".into()));
                object.insert("project_goal".into(), Value::String(project_goal));
                object.insert("orchestratorId".into(), Value::String(orchestrator_id));
                object.insert("background".into(), Value::Bool(false));
                if let Ok(workspace) = env::var("GENOS_WORKSPACE_ROOT") {
                    object.insert("workspace_root".into(), Value::String(workspace));
                }
            }
            ("__genos_backend_orchestrate__".to_string(), request)
        } else if name == "genos_delegate_worker" {
            let Some(mission) = arguments
                .get("mission")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
            else {
                return tool_error(
                    id,
                    "genos_delegate_worker requires a non-empty mission.".into(),
                );
            };
            let Some(orchestrator_id) = env::var("GENOS_ORCHESTRATOR_AGENT_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
            else {
                return tool_error(
                    id,
                    "genos_delegate_worker requires an orchestrator authority ID.".into(),
                );
            };
            let mut request = arguments;
            if let Some(object) = request.as_object_mut() {
                object.insert("action".into(), Value::String("dispatch_worker".into()));
                object.insert("mission".into(), Value::String(mission));
                object.insert("orchestratorId".into(), Value::String(orchestrator_id));
                object.insert("background".into(), Value::Bool(true));
                if let Ok(workspace) = env::var("GENOS_WORKSPACE_ROOT") {
                    object.insert("workspace_root".into(), Value::String(workspace));
                }
            }
            ("__genos_backend_orchestrate__".to_string(), request)
        } else if name == "genos_orchestrate"
            && arguments.get("operation").is_none()
            && expose_full_catalog() == false
        {
            let mut request = arguments;
            if let Some(object) = request.as_object_mut() {
                object
                    .entry("background")
                    .or_insert_with(|| Value::Bool(true));
            }
            ("__genos_backend_orchestrate__".to_string(), request)
        } else if name == "genos_orchestrate" {
            let operation = arguments
                .get("operation")
                .and_then(Value::as_str)
                .unwrap_or("solve");
            let operation_name = format!(
                "genos_{}",
                operation.strip_prefix("genos_").unwrap_or(operation)
            );
            let task = arguments
                .get("task")
                .and_then(Value::as_str)
                .unwrap_or("Autonomous GenOS orchestration");
            let operation_arguments = arguments.get("arguments").cloned().unwrap_or_else(|| {
                if operation == "solve" {
                    json!({"problem": task})
                } else {
                    json!({"query": task})
                }
            });
            (operation_name, operation_arguments)
        } else if expose_full_catalog() {
            (name.to_string(), arguments)
        } else {
            return tool_error(id, "Only genos_orchestrate is public. Set GENOS_MCP_EXPOSE_ALL=true for an internal full-catalog client.".into());
        };
        let planned = if operation_name == "__genos_backend_orchestrate__" {
            genos_protocol::PlannedCommand {
                operation: "backend_orchestrate".into(),
                args: vec![operation_name, operation_arguments.to_string()],
            }
        } else {
            match plan_tool_call(&operation_name, &operation_arguments) {
                Ok(planned) => planned,
                Err(error) => return tool_error(id, error.to_string()),
            }
        };

        match self.executor.execute(&planned.args).await {
            Ok(execution) => {
                let result = ProtocolResult::new(
                    planned.operation,
                    CommandOutcome {
                        exit_code: execution.exit_code,
                        stdout: execution.stdout,
                        stderr: execution.stderr,
                    },
                );
                let text = serde_json::to_string_pretty(&result)
                    .unwrap_or_else(|error| format!("failed to serialize GenOS result: {error}"));
                success_response(
                    id,
                    json!({
                        "content": [{"type": "text", "text": text}],
                        "structuredContent": result,
                        "isError": execution.exit_code != 0
                    }),
                )
            }
            Err(error) => tool_error(id, format!("failed to launch GenOS: {error}")),
        }
    }
}