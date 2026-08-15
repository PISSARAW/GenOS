use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use thiserror::Error;

pub const PROTOCOL_VERSION: &str = "genos.protocol/v1alpha1";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolSpec {
    pub name: String,
    pub title: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
    #[serde(rename = "outputSchema")]
    pub output_schema: Value,
    pub annotations: ToolAnnotations,
    #[serde(rename = "_meta")]
    pub meta: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAnnotations {
    pub read_only_hint: bool,
    pub destructive_hint: bool,
    pub idempotent_hint: bool,
    pub open_world_hint: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PlannedCommand {
    pub operation: String,
    pub args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ProtocolResult {
    pub protocol_version: String,
    pub operation: String,
    pub exit_code: i32,
    pub output: Option<Value>,
    pub stdout: String,
    pub stderr: String,
}

impl ProtocolResult {
    pub fn new(
        operation: impl Into<String>,
        exit_code: i32,
        stdout: String,
        stderr: String,
    ) -> Self {
        let output = serde_json::from_str(stdout.trim()).ok();
        Self {
            protocol_version: PROTOCOL_VERSION.to_string(),
            operation: operation.into(),
            exit_code,
            output,
            stdout,
            stderr,
        }
    }
}

#[derive(Debug, Error, PartialEq)]
pub enum ProtocolError {
    #[error("unknown GenOS tool '{0}'")]
    UnknownTool(String),
    #[error("invalid input for {operation}: {message}")]
    InvalidInput { operation: String, message: String },
}

pub fn tool_specs() -> Vec<ToolSpec> {
    vec![
        spec(
            "create",
            "Create agent genome",
            "Create a provider-neutral GenOS agent genome.",
            object_schema(
                [
                    ("name", string_schema("Stable agent name.")),
                    ("role", string_schema("Agent role.")),
                    ("out", string_schema("Optional output file path.")),
                ],
                &["name", "role"],
            ),
            false,
            false,
            false,
        ),
        spec(
            "snapshot",
            "Snapshot capsule",
            "Checkpoint an atomic agent-world capsule.",
            capsule_schema(),
            false,
            false,
            false,
        ),
        spec(
            "restore",
            "Restore capsule",
            "Restore a paused agent-world capsule into a live isolated world.",
            capsule_schema(),
            false,
            false,
            false,
        ),
        spec(
            "fork",
            "Fork capsule",
            "Create isolated counterfactual descendants from an agent-world capsule.",
            object_schema(
                [
                    ("capsule_id", string_schema("Parent capsule identifier.")),
                    (
                        "branches",
                        json!({
                            "type": "array",
                            "minItems": 1,
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "properties": {
                                    "label": {"type": "string", "minLength": 1},
                                    "hypothesis": {"type": "string", "minLength": 1}
                                },
                                "required": ["label", "hypothesis"]
                            }
                        }),
                    ),
                    ("root", root_schema()),
                ],
                &["capsule_id", "branches"],
            ),
            false,
            false,
            false,
        ),
        spec(
            "run",
            "Run in capsule",
            "Execute one explicitly requested command in a capsule's isolated world. This consumes budget and may change files.",
            object_schema(
                [
                    ("capsule_id", string_schema("Capsule identifier.")),
                    ("command", string_schema("Command to execute in the isolated world.")),
                    ("root", root_schema()),
                    ("allow_failure", json!({"type": "boolean", "default": false})),
                ],
                &["capsule_id", "command"],
            ),
            false,
            true,
            true,
        ),
        spec(
            "inspect",
            "Inspect agent",
            "Read and validate a GenOS agent genome.",
            object_schema(
                [("path", string_schema("Agent genome path."))],
                &["path"],
            ),
            true,
            false,
            false,
        ),
        spec(
            "diff",
            "Diff snapshots",
            "Compare two logical GenOS snapshots without changing them.",
            object_schema(
                [
                    ("a", string_schema("Left snapshot path or identifier.")),
                    ("b", string_schema("Right snapshot path or identifier.")),
                    ("root", root_schema()),
                    ("store", string_schema("Optional snapshot store path.")),
                ],
                &["a", "b"],
            ),
            true,
            false,
            false,
        ),
        spec(
            "lineage",
            "Inspect lineage",
            "Read the snapshot lineage DAG, optionally anchored at one snapshot.",
            object_schema(
                [
                    ("snapshot", string_schema("Optional snapshot path or identifier.")),
                    ("root_snapshot", string_schema("Optional root snapshot identifier.")),
                    ("root", root_schema()),
                ],
                &[],
            ),
            true,
            false,
            false,
        ),
        spec(
            "replay",
            "Replay events",
            "Reconstruct agent state from the GenOS event stream.",
            object_schema(
                [
                    ("snapshot", string_schema("Optional snapshot path or identifier.")),
                    ("branch_id", string_schema("Optional branch identifier.")),
                    ("root", root_schema()),
                ],
                &[],
            ),
            true,
            false,
            false,
        ),
        spec(
            "merge",
            "Merge branch knowledge",
            "Run the evidence-aware cognitive merge described by a manifest.",
            object_schema(
                [("manifest", string_schema("Cognitive merge manifest path."))],
                &["manifest"],
            ),
            false,
            false,
            false,
        ),
    ]
}

pub fn plan_tool_call(name: &str, arguments: &Value) -> Result<PlannedCommand, ProtocolError> {
    let operation = name.strip_prefix("genos_").unwrap_or(name);
    let object = arguments
        .as_object()
        .ok_or_else(|| invalid(operation, "arguments must be an object"))?;
    let mut args = vec!["agent".to_string(), operation.to_string()];

    match operation {
        "create" => {
            push_flag(
                &mut args,
                "--name",
                required_string(object, operation, "name")?,
            );
            push_flag(
                &mut args,
                "--role",
                required_string(object, operation, "role")?,
            );
            if let Some(out) = optional_string(object, operation, "out")? {
                push_flag(&mut args, "--out", out);
            }
            push_flag(&mut args, "--format", "json");
        }
        "snapshot" | "restore" => {
            args.push(required_string(object, operation, "capsule_id")?.to_string());
            push_root(&mut args, object, operation, "--root")?;
        }
        "fork" => {
            args.push(required_string(object, operation, "capsule_id")?.to_string());
            let branches = object
                .get("branches")
                .and_then(Value::as_array)
                .ok_or_else(|| invalid(operation, "'branches' must be a non-empty array"))?;
            if branches.is_empty() {
                return Err(invalid(operation, "'branches' must be a non-empty array"));
            }
            for branch in branches {
                let branch = branch
                    .as_object()
                    .ok_or_else(|| invalid(operation, "each branch must be an object"))?;
                let label = required_string(branch, operation, "label")?;
                let hypothesis = required_string(branch, operation, "hypothesis")?;
                if label.contains('=') {
                    return Err(invalid(operation, "branch labels cannot contain '='"));
                }
                push_flag(&mut args, "--branch", &format!("{label}={hypothesis}"));
            }
            push_root(&mut args, object, operation, "--root")?;
        }
        "run" => {
            args.push(required_string(object, operation, "capsule_id")?.to_string());
            push_flag(
                &mut args,
                "--command",
                required_string(object, operation, "command")?,
            );
            push_root(&mut args, object, operation, "--root")?;
            if optional_bool(object, operation, "allow_failure")?.unwrap_or(false) {
                args.push("--allow-failure".to_string());
            }
            push_flag(&mut args, "--format", "json");
        }
        "inspect" => {
            args.push(required_string(object, operation, "path")?.to_string());
            push_flag(&mut args, "--format", "json");
        }
        "diff" => {
            args.push(required_string(object, operation, "a")?.to_string());
            args.push(required_string(object, operation, "b")?.to_string());
            push_root(&mut args, object, operation, "--root")?;
            if let Some(store) = optional_string(object, operation, "store")? {
                push_flag(&mut args, "--store", store);
            }
            push_flag(&mut args, "--format", "json");
        }
        "lineage" => {
            let snapshot = optional_string(object, operation, "snapshot")?;
            let root_snapshot = optional_string(object, operation, "root_snapshot")?;
            if snapshot.is_some() && root_snapshot.is_some() {
                return Err(invalid(
                    operation,
                    "'snapshot' and 'root_snapshot' are mutually exclusive",
                ));
            }
            if let Some(value) = snapshot {
                push_flag(&mut args, "--snapshot", value);
            }
            if let Some(value) = root_snapshot {
                push_flag(&mut args, "--root", value);
            }
            push_root(&mut args, object, operation, "--root-dir")?;
            push_flag(&mut args, "--format", "json");
            args.push("--full-id".to_string());
        }
        "replay" => {
            let snapshot = optional_string(object, operation, "snapshot")?;
            let branch_id = optional_string(object, operation, "branch_id")?;
            if snapshot.is_some() && branch_id.is_some() {
                return Err(invalid(
                    operation,
                    "'snapshot' and 'branch_id' are mutually exclusive",
                ));
            }
            push_root(&mut args, object, operation, "--root")?;
            if let Some(value) = snapshot {
                push_flag(&mut args, "--snapshot", value);
            }
            if let Some(value) = branch_id {
                push_flag(&mut args, "--branch-id", value);
            }
            push_flag(&mut args, "--format", "json");
        }
        "merge" => {
            args.push(required_string(object, operation, "manifest")?.to_string());
            push_flag(&mut args, "--format", "json");
        }
        _ => return Err(ProtocolError::UnknownTool(name.to_string())),
    }

    Ok(PlannedCommand {
        operation: operation.to_string(),
        args,
    })
}

fn spec(
    operation: &str,
    title: &str,
    description: &str,
    input_schema: Value,
    read_only: bool,
    destructive: bool,
    open_world: bool,
) -> ToolSpec {
    ToolSpec {
        name: format!("genos_{operation}"),
        title: title.to_string(),
        description: description.to_string(),
        input_schema,
        output_schema: result_schema(),
        annotations: ToolAnnotations {
            read_only_hint: read_only,
            destructive_hint: destructive,
            idempotent_hint: read_only,
            open_world_hint: open_world,
        },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION}),
    }
}

fn object_schema<const N: usize>(properties: [(&str, Value); N], required: &[&str]) -> Value {
    let properties: Map<String, Value> = properties
        .into_iter()
        .map(|(name, schema)| (name.to_string(), schema))
        .collect();
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": false,
        "properties": properties,
        "required": required
    })
}

fn capsule_schema() -> Value {
    object_schema(
        [
            ("capsule_id", string_schema("Capsule identifier.")),
            ("root", root_schema()),
        ],
        &["capsule_id"],
    )
}

fn string_schema(description: &str) -> Value {
    json!({"type": "string", "minLength": 1, "description": description})
}

fn root_schema() -> Value {
    json!({"type": "string", "minLength": 1, "default": ".genos", "description": "GenOS data root."})
}

fn result_schema() -> Value {
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "protocol_version": {"const": PROTOCOL_VERSION},
            "operation": {"type": "string"},
            "exit_code": {"type": "integer"},
            "output": {},
            "stdout": {"type": "string"},
            "stderr": {"type": "string"}
        },
        "required": ["protocol_version", "operation", "exit_code", "stdout", "stderr"]
    })
}

fn required_string<'a>(
    object: &'a Map<String, Value>,
    operation: &str,
    key: &str,
) -> Result<&'a str, ProtocolError> {
    optional_string(object, operation, key)?
        .ok_or_else(|| invalid(operation, &format!("missing required string '{key}'")))
}

fn optional_string<'a>(
    object: &'a Map<String, Value>,
    operation: &str,
    key: &str,
) -> Result<Option<&'a str>, ProtocolError> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) if !value.is_empty() => Ok(Some(value)),
        Some(_) => Err(invalid(
            operation,
            &format!("'{key}' must be a non-empty string"),
        )),
    }
}

fn optional_bool(
    object: &Map<String, Value>,
    operation: &str,
    key: &str,
) -> Result<Option<bool>, ProtocolError> {
    match object.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(value)) => Ok(Some(*value)),
        Some(_) => Err(invalid(operation, &format!("'{key}' must be a boolean"))),
    }
}

fn push_root(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    operation: &str,
    flag: &str,
) -> Result<(), ProtocolError> {
    push_flag(
        args,
        flag,
        optional_string(object, operation, "root")?.unwrap_or(".genos"),
    );
    Ok(())
}

fn push_flag(args: &mut Vec<String>, flag: &str, value: &str) {
    args.push(flag.to_string());
    args.push(value.to_string());
}

fn invalid(operation: &str, message: &str) -> ProtocolError {
    ProtocolError::InvalidInput {
        operation: operation.to_string(),
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn catalog_contains_the_ten_canonical_unique_tools() {
        let specs = tool_specs();
        assert_eq!(specs.len(), 10);
        let names = specs
            .iter()
            .map(|tool| tool.name.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(names.len(), specs.len());
        assert!(specs.iter().all(|tool| {
            tool.meta["genos/protocolVersion"] == PROTOCOL_VERSION
                && tool.input_schema["type"] == "object"
                && tool.output_schema["type"] == "object"
        }));
        for expected in [
            "create", "snapshot", "restore", "fork", "run", "inspect", "diff", "lineage", "replay",
            "merge",
        ] {
            assert!(names.contains(format!("genos_{expected}").as_str()));
        }
    }

    #[test]
    fn fork_maps_to_distinct_process_arguments_without_shell_interpolation() {
        let planned = plan_tool_call(
            "genos_fork",
            &json!({
                "capsule_id": "cap 1",
                "branches": [{"label": "A", "hypothesis": "try; echo unsafe"}],
                "root": ".state"
            }),
        )
        .unwrap();
        assert_eq!(
            planned.args,
            [
                "agent",
                "fork",
                "cap 1",
                "--branch",
                "A=try; echo unsafe",
                "--root",
                ".state"
            ]
        );
    }

    #[test]
    fn mutually_exclusive_replay_anchors_are_rejected() {
        let error = plan_tool_call(
            "genos_replay",
            &json!({"snapshot": "snap", "branch_id": "branch"}),
        )
        .unwrap_err();
        assert!(error.to_string().contains("mutually exclusive"));
    }

    #[test]
    fn protocol_result_parses_structured_cli_output() {
        let result = ProtocolResult::new("diff", 0, "{\"empty\":true}\n".into(), String::new());
        assert_eq!(result.output, Some(json!({"empty": true})));
        assert_eq!(result.protocol_version, PROTOCOL_VERSION);
    }
}
