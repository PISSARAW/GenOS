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
        spec(
            "workspace_experiment",
            "Run workspace experiment",
            "Fork isolated code workspaces, apply planned alternatives, run verification, diff outcomes, evaluate them, and preserve lineage.",
            object_schema(
                [
                    ("manifest", string_schema("Optional complete workspace experiment manifest.")),
                    ("repo", string_schema("Repository or workspace used as the direct seed.")),
                    ("plan", string_schema("Workspace experiment plan path.")),
                    ("root", experiment_root_schema()),
                ],
                &[],
            ),
            false,
            true,
            false,
        ),
        spec(
            "causal_replay_experiment",
            "Run causal replay experiment",
            "Restore a historical decision point, fork alternative realities, replay known events, and explain causal divergence.",
            object_schema(
                [
                    ("manifest", string_schema("Causal replay experiment manifest path.")),
                    ("root", experiment_root_schema()),
                ],
                &["manifest"],
            ),
            false,
            false,
            false,
        ),
        spec(
            "incident_experiment",
            "Reproduce production incident",
            "Search and recursively refine mutated universes against production incident evidence.",
            object_schema(
                [
                    ("manifest", string_schema("Optional complete incident search manifest.")),
                    ("snapshot", string_schema("Production snapshot reference.")),
                    ("evidence", string_schema("Incident evidence YAML/JSON path.")),
                    ("search_plan", string_schema("Adaptive search plan path.")),
                    ("root", experiment_root_schema()),
                    ("summary", json!({"type":"boolean","default":false})),
                ],
                &[],
            ),
            false,
            false,
            false,
        ),
        spec(
            "scientific_experiment",
            "Run scientific experiment",
            "Version hypotheses, execute protocols, preserve evidence, critique results, reproduce findings, and rewind suspect conclusions.",
            object_schema(
                [
                    ("manifest", string_schema("Optional complete scientific experiment manifest.")),
                    ("dataset", string_schema("Dataset path supplied at execution time.")),
                    ("research_plan", string_schema("Scientific research plan path.")),
                    ("root", experiment_root_schema()),
                    ("summary", json!({"type":"boolean","default":false})),
                ],
                &[],
            ),
            false,
            false,
            false,
        ),
        spec(
            "security_coevolution",
            "Run security coevolution",
            "Co-evolve abstract Red and Blue genomes in isolated simulated environments with neutral observations.",
            object_schema(
                [
                    ("manifest", string_schema("Optional complete security coevolution manifest.")),
                    ("environment", string_schema("Security scenario environment path.")),
                    ("evolution_plan", string_schema("Evolution plan path.")),
                    ("root", experiment_root_schema()),
                    ("summary", json!({"type":"boolean","default":false})),
                ],
                &[],
            ),
            false,
            false,
            false,
        ),
        spec(
            "bug_investigation",
            "Investigate unknown-cause bug",
            "Falsify competing bug explanations in isolated code worlds while preserving rejected hypotheses and evidence.",
            object_schema(
                [
                    ("manifest", string_schema("Optional complete bug investigation manifest.")),
                    ("repo", string_schema("Repository used as the direct investigation seed.")),
                    ("plan", string_schema("Hypothesis and probe plan path.")),
                    ("root", experiment_root_schema()),
                    ("summary", json!({"type":"boolean","default":false})),
                ],
                &[],
            ),
            false,
            true,
            false,
        ),
        spec("diagnose", "Diagnose with hypotheses", "Create a falsification-oriented hypothesis tree before changing code.",
            object_schema([("problem", string_schema("Problem to diagnose.")), ("hypotheses", string_array_schema("Competing falsifiable hypotheses.")), ("root", root_schema())], &["problem", "hypotheses"]), false, false, false),
        spec("hypothesis_evidence", "Add hypothesis evidence", "Attach provenance-bearing evidence and update a hypothesis confidence/status.",
            object_schema([("diagnosis_id", string_schema("Diagnosis identifier.")), ("hypothesis_id", string_schema("Hypothesis identifier.")), ("claim", string_schema("Evidence claim.")), ("source", string_schema("Evidence source.")), ("artifact", string_schema("Optional artifact reference.")), ("against", json!({"type":"boolean","default":false})), ("confidence", json!({"type":"number","minimum":0,"maximum":1})), ("root", root_schema())], &["diagnosis_id","hypothesis_id","claim","source","confidence"]), false, false, false),
        spec("solve", "Explore solution trajectories", "Create diverse isolated solution trajectories with adaptive compute and minimal-patch support.",
            object_schema([("problem", string_schema("Issue or problem.")), ("strategies", string_array_schema("Explicitly diverse strategies.")), ("branches", json!({"type":"integer","minimum":1,"maximum":64,"default":8})), ("minimal_patch", json!({"type":"boolean","default":false})), ("root", root_schema())], &["problem"]), false, false, false),
        spec("evaluate_trajectories", "Evaluate trajectories", "Score candidates, suspend dominated branches without deleting lineage, and adapt compute/model tiers.",
            object_schema([("solve_id", string_schema("Solve run identifier.")), ("scores", string_array_schema("trajectory_id=score values.")), ("keep", json!({"type":"integer","minimum":1,"default":2})), ("root", root_schema())], &["solve_id","scores"]), false, false, false),
        spec("record_decision", "Record decision lineage", "Persist a living ADR/decision with assumptions, alternatives, evidence, requirements, code, tests, and hypothesis lineage.",
            object_schema([("title", string_schema("Decision title.")), ("alternatives", string_array_schema("Rejected alternatives.")), ("evidence", string_array_schema("Evidence references.")), ("assumptions", string_array_schema("Assumptions to track.")), ("code_refs", string_array_schema("Code references.")), ("test_refs", string_array_schema("Test references.")), ("requirement_refs", string_array_schema("Requirement references.")), ("expected", string_schema("Expected outcome.")), ("observed", string_schema("Observed outcome.")), ("parent_hypothesis", string_schema("Parent hypothesis.")), ("root", root_schema())], &["title"]), false, false, false),
        spec("blame", "Causal code blame", "Trace a code, test, requirement, or decision reference back to cognitive decisions and evidence.",
            object_schema([("reference", string_schema("Code/test/requirement/decision reference.")), ("root", root_schema())], &["reference"]), true, false, false),
        spec("invalidate_assumption", "Invalidate assumption", "Mark an assumption invalid and return affected decisions, code, tests, and requirements.",
            object_schema([("assumption", string_schema("Assumption text or identifying fragment.")), ("observed", string_schema("Observation that invalidates it.")), ("root", root_schema())], &["assumption","observed"]), false, false, false),
        spec("record_experience", "Record branch experience", "Persist positive or negative knowledge with context, evidence, and branch provenance.",
            object_schema([("strategy", string_schema("Attempted strategy.")), ("context", string_schema("Applicability context.")), ("outcome", string_schema("Observed outcome.")), ("successful", json!({"type":"boolean"})), ("evidence", string_array_schema("Evidence references.")), ("source_branch", string_schema("Origin branch.")), ("root", root_schema())], &["strategy","context","outcome","successful"]), false, false, false),
        spec("search_failures", "Search failed approaches", "Find negative knowledge before agents retry a known-bad strategy.",
            object_schema([("query", string_schema("Context or strategy query.")), ("root", root_schema())], &["query"]), true, false, false),
        spec("cherry_pick_experience", "Cherry-pick experience", "Transfer one provenance-preserving discovery without copying an entire branch context.",
            object_schema([("experience_id", string_schema("Experience artifact.")), ("to_branch", string_schema("Receiving branch.")), ("root", root_schema())], &["experience_id","to_branch"]), false, false, false),
        spec("adversarial_review", "Adversarial review", "Plan blind, diverse security/correctness/performance review and counterfactual tests across worlds.",
            object_schema([("target", string_schema("Patch or trajectory to review.")), ("critics", string_array_schema("Specialized reviewer roles/models.")), ("worlds", string_array_schema("Counterfactual worlds.")), ("rounds", json!({"type":"integer","minimum":1,"default":1})), ("blind", json!({"type":"boolean","default":true})), ("root", root_schema())], &["target"]), false, false, false),
        spec("future_ci", "Plan future CI", "Verify code across plausible worlds, dependency futures, and autonomous migration targets.",
            object_schema([("target", string_schema("Patch, PR, or branch.")), ("worlds", string_array_schema("Future worlds.")), ("agents", string_array_schema("Verification specializations.")), ("dependency", string_schema("Dependency future, e.g. react@next.")), ("migration_from", string_schema("Migration source.")), ("migration_to", string_schema("Migration target.")), ("root", root_schema())], &["target","worlds"]), false, false, false),
        spec("repository_genome", "Update repository genome", "Persist architecture, conventions, invariants, policies, vocabulary, and forbidden patterns for all coding branches.",
            object_schema([("architecture", string_array_schema("Architecture facts.")), ("conventions", string_array_schema("Repository conventions.")), ("invariants", string_array_schema("Architecture invariants.")), ("security_rules", string_array_schema("Security rules.")), ("testing_policy", string_array_schema("Testing policy.")), ("performance_requirements", string_array_schema("Performance constraints.")), ("domain_language", string_array_schema("Domain vocabulary.")), ("forbidden_patterns", string_array_schema("Forbidden patterns.")), ("root", root_schema())], &[]), false, false, false),
        spec("bisect_agent", "Bisect agent trajectory", "Locate the first bad event, belief, memory, or world observation in an ordered trajectory.",
            object_schema([("states", string_array_schema("Ordered label=good|bad observations.")), ("dimension", string_schema("events, beliefs, memory, or world."))], &["states"]), true, false, false),
        spec("analyze_trajectory", "Analyze coding trajectory", "Detect the first regression, repeated failed edits, cognitive loops, and the safest automatic revert point.",
            object_schema([("steps", string_array_schema("Ordered snapshot|good|action_signature|belief_signature steps."))], &["steps"]), true, false, false),
        spec("compile_memory", "Compile development memory", "Garbage-collect context into facts, decisions, failures, constraints, questions, and source references.",
            object_schema([("facts", string_array_schema("Verified facts.")), ("decisions", string_array_schema("Active decisions.")), ("failures", string_array_schema("Negative knowledge.")), ("constraints", string_array_schema("Active constraints.")), ("open_questions", string_array_schema("Open questions.")), ("source_refs", string_array_schema("Original evidence references.")), ("root", root_schema())], &[]), false, false, false),
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
        "workspace_experiment" => {
            args = vec!["experiment".into(), "workspace".into()];
            push_manifest_or_pair(
                &mut args, object, operation, "repo", "--repo", "plan", "--plan",
            )?;
            push_optional_experiment_root(&mut args, object, operation)?;
            push_flag(&mut args, "--format", "json");
        }
        "causal_replay_experiment" => {
            args = vec!["experiment".into(), "causal-replay".into()];
            args.push(required_string(object, operation, "manifest")?.into());
            push_optional_experiment_root(&mut args, object, operation)?;
            push_flag(&mut args, "--format", "json");
        }
        "incident_experiment" => {
            args = vec!["experiment".into(), "incident".into()];
            push_manifest_or_triplet(
                &mut args,
                object,
                operation,
                [
                    ("snapshot", "--snapshot"),
                    ("evidence", "--evidence"),
                    ("search_plan", "--search-plan"),
                ],
            )?;
            push_experiment_tail(&mut args, object, operation)?;
        }
        "scientific_experiment" => {
            args = vec!["experiment".into(), "scientific".into()];
            push_manifest_or_pair(
                &mut args,
                object,
                operation,
                "dataset",
                "--dataset",
                "research_plan",
                "--research-plan",
            )?;
            push_experiment_tail(&mut args, object, operation)?;
        }
        "security_coevolution" => {
            args = vec!["experiment".into(), "security-coevolution".into()];
            push_manifest_or_pair(
                &mut args,
                object,
                operation,
                "environment",
                "--environment",
                "evolution_plan",
                "--evolution-plan",
            )?;
            push_experiment_tail(&mut args, object, operation)?;
        }
        "bug_investigation" => {
            args = vec!["experiment".into(), "bug-investigation".into()];
            push_manifest_or_pair(
                &mut args, object, operation, "repo", "--repo", "plan", "--plan",
            )?;
            push_experiment_tail(&mut args, object, operation)?;
        }
        "diagnose" => {
            args[0] = "dev".into();
            args.push(required_string(object, operation, "problem")?.into());
            push_string_array(
                &mut args,
                object,
                operation,
                "hypotheses",
                "--hypothesis",
                true,
            )?;
            push_root(&mut args, object, operation, "--root")?;
        }
        "solve" => {
            args[0] = "dev".into();
            args.push(required_string(object, operation, "problem")?.into());
            push_string_array(
                &mut args,
                object,
                operation,
                "strategies",
                "--strategy",
                false,
            )?;
            push_usize(
                &mut args,
                object,
                operation,
                "branches",
                "--branches",
                Some(8),
            )?;
            if optional_bool(object, operation, "minimal_patch")?.unwrap_or(false) {
                args.push("--minimal-patch".into());
            }
            push_root(&mut args, object, operation, "--root")?;
        }
        "hypothesis_evidence" => {
            args[0] = "dev".into();
            args[1] = "hypothesis-evidence".into();
            args.push(required_string(object, operation, "diagnosis_id")?.into());
            args.push(required_string(object, operation, "hypothesis_id")?.into());
            for (key, flag) in [("claim", "--claim"), ("source", "--source")] {
                push_flag(&mut args, flag, required_string(object, operation, key)?);
            }
            if let Some(v) = optional_string(object, operation, "artifact")? {
                push_flag(&mut args, "--artifact", v);
            }
            if optional_bool(object, operation, "against")?.unwrap_or(false) {
                args.push("--against".into());
            }
            push_number(&mut args, object, operation, "confidence", "--confidence")?;
            push_root(&mut args, object, operation, "--root")?;
        }
        "evaluate_trajectories" => {
            args[0] = "dev".into();
            args[1] = "evaluate-trajectories".into();
            args.push(required_string(object, operation, "solve_id")?.into());
            push_string_array(&mut args, object, operation, "scores", "--score", true)?;
            push_usize(&mut args, object, operation, "keep", "--keep", Some(2))?;
            push_root(&mut args, object, operation, "--root")?;
        }
        "record_decision" => {
            args[0] = "dev".into();
            args[1] = "record-decision".into();
            args.push(required_string(object, operation, "title")?.into());
            for (key, flag) in [
                ("alternatives", "--alternative"),
                ("evidence", "--evidence"),
                ("assumptions", "--assumption"),
                ("code_refs", "--code-ref"),
                ("test_refs", "--test-ref"),
                ("requirement_refs", "--requirement-ref"),
            ] {
                push_string_array(&mut args, object, operation, key, flag, false)?;
            }
            for (key, flag) in [
                ("expected", "--expected"),
                ("observed", "--observed"),
                ("parent_hypothesis", "--parent-hypothesis"),
            ] {
                if let Some(v) = optional_string(object, operation, key)? {
                    push_flag(&mut args, flag, v);
                }
            }
            push_root(&mut args, object, operation, "--root")?;
        }
        "blame" | "search_failures" => {
            args[0] = "dev".into();
            args[1] = operation.replace('_', "-");
            let key = if operation == "blame" {
                "reference"
            } else {
                "query"
            };
            args.push(required_string(object, operation, key)?.into());
            push_root(&mut args, object, operation, "--root")?;
        }
        "invalidate_assumption" => {
            args[0] = "dev".into();
            args[1] = "invalidate-assumption".into();
            args.push(required_string(object, operation, "assumption")?.into());
            push_flag(
                &mut args,
                "--observed",
                required_string(object, operation, "observed")?,
            );
            push_root(&mut args, object, operation, "--root")?;
        }
        "record_experience" => {
            args[0] = "dev".into();
            args[1] = "record-experience".into();
            args.push(required_string(object, operation, "strategy")?.into());
            for (key, flag) in [("context", "--context"), ("outcome", "--outcome")] {
                push_flag(&mut args, flag, required_string(object, operation, key)?);
            }
            if required_bool(object, operation, "successful")? {
                args.push("--successful".into());
            }
            push_string_array(
                &mut args,
                object,
                operation,
                "evidence",
                "--evidence",
                false,
            )?;
            if let Some(v) = optional_string(object, operation, "source_branch")? {
                push_flag(&mut args, "--source-branch", v);
            }
            push_root(&mut args, object, operation, "--root")?;
        }
        "cherry_pick_experience" => {
            args[0] = "dev".into();
            args[1] = "cherry-pick-experience".into();
            args.push(required_string(object, operation, "experience_id")?.into());
            push_flag(
                &mut args,
                "--to-branch",
                required_string(object, operation, "to_branch")?,
            );
            push_root(&mut args, object, operation, "--root")?;
        }
        "adversarial_review" => {
            args[0] = "dev".into();
            args[1] = "adversarial-review".into();
            args.push(required_string(object, operation, "target")?.into());
            push_string_array(&mut args, object, operation, "critics", "--critic", false)?;
            push_string_array(&mut args, object, operation, "worlds", "--world", false)?;
            push_usize(&mut args, object, operation, "rounds", "--rounds", Some(1))?;
            push_flag(
                &mut args,
                "--blind",
                if optional_bool(object, operation, "blind")?.unwrap_or(true) {
                    "true"
                } else {
                    "false"
                },
            );
            push_root(&mut args, object, operation, "--root")?;
        }
        "future_ci" => {
            args[0] = "dev".into();
            args[1] = "future-ci".into();
            args.push(required_string(object, operation, "target")?.into());
            push_string_array(&mut args, object, operation, "worlds", "--world", true)?;
            push_string_array(&mut args, object, operation, "agents", "--agent", false)?;
            for (key, flag) in [
                ("dependency", "--dependency"),
                ("migration_from", "--migration-from"),
                ("migration_to", "--migration-to"),
            ] {
                if let Some(v) = optional_string(object, operation, key)? {
                    push_flag(&mut args, flag, v);
                }
            }
            push_root(&mut args, object, operation, "--root")?;
        }
        "repository_genome" => {
            args[0] = "dev".into();
            args[1] = "repository-genome".into();
            for (key, flag) in [
                ("architecture", "--architecture"),
                ("conventions", "--convention"),
                ("invariants", "--invariant"),
                ("security_rules", "--security-rule"),
                ("testing_policy", "--testing-policy"),
                ("performance_requirements", "--performance-requirement"),
                ("domain_language", "--domain-term"),
                ("forbidden_patterns", "--forbidden-pattern"),
            ] {
                push_string_array(&mut args, object, operation, key, flag, false)?;
            }
            push_root(&mut args, object, operation, "--root")?;
        }
        "bisect_agent" => {
            args[0] = "dev".into();
            args[1] = "bisect-agent".into();
            push_string_array(&mut args, object, operation, "states", "--state", true)?;
            if let Some(v) = optional_string(object, operation, "dimension")? {
                push_flag(&mut args, "--dimension", v);
            }
        }
        "analyze_trajectory" => {
            args[0] = "dev".into();
            args[1] = "analyze-trajectory".into();
            push_string_array(&mut args, object, operation, "steps", "--step", true)?;
        }
        "compile_memory" => {
            args[0] = "dev".into();
            args[1] = "compile-memory".into();
            for (key, flag) in [
                ("facts", "--fact"),
                ("decisions", "--decision"),
                ("failures", "--failure"),
                ("constraints", "--constraint"),
                ("open_questions", "--open-question"),
                ("source_refs", "--source-ref"),
            ] {
                push_string_array(&mut args, object, operation, key, flag, false)?;
            }
            push_root(&mut args, object, operation, "--root")?;
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

fn string_array_schema(description: &str) -> Value {
    json!({"type":"array","items":{"type":"string","minLength":1},"description":description})
}

fn root_schema() -> Value {
    json!({"type": "string", "minLength": 1, "default": ".genos", "description": "GenOS data root."})
}

fn experiment_root_schema() -> Value {
    json!({"type": "string", "minLength": 1, "default": ".genos/experiments", "description": "Experiment report and world root."})
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

fn required_bool(
    object: &Map<String, Value>,
    operation: &str,
    key: &str,
) -> Result<bool, ProtocolError> {
    optional_bool(object, operation, key)?
        .ok_or_else(|| invalid(operation, &format!("missing required boolean '{key}'")))
}

fn push_string_array(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    operation: &str,
    key: &str,
    flag: &str,
    required: bool,
) -> Result<(), ProtocolError> {
    let values = match object.get(key) {
        None | Some(Value::Null) if !required => return Ok(()),
        Some(Value::Array(values)) if !values.is_empty() || !required => values,
        _ => {
            return Err(invalid(
                operation,
                &format!(
                    "'{key}' must be {}array of non-empty strings",
                    if required { "a non-empty " } else { "an " }
                ),
            ))
        }
    };
    for value in values {
        let value = value.as_str().filter(|v| !v.is_empty()).ok_or_else(|| {
            invalid(
                operation,
                &format!("'{key}' entries must be non-empty strings"),
            )
        })?;
        push_flag(args, flag, value);
    }
    Ok(())
}

fn push_usize(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    operation: &str,
    key: &str,
    flag: &str,
    default: Option<usize>,
) -> Result<(), ProtocolError> {
    let value = match object.get(key) {
        None | Some(Value::Null) => default,
        Some(v) => v.as_u64().map(|v| v as usize),
    };
    let value =
        value.ok_or_else(|| invalid(operation, &format!("'{key}' must be a positive integer")))?;
    if value == 0 {
        return Err(invalid(operation, &format!("'{key}' must be positive")));
    }
    push_flag(args, flag, &value.to_string());
    Ok(())
}

fn push_number(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    operation: &str,
    key: &str,
    flag: &str,
) -> Result<(), ProtocolError> {
    let value = object
        .get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| invalid(operation, &format!("'{key}' must be a number")))?;
    push_flag(args, flag, &value.to_string());
    Ok(())
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

fn push_manifest_or_pair(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    operation: &str,
    first_key: &str,
    first_flag: &str,
    second_key: &str,
    second_flag: &str,
) -> Result<(), ProtocolError> {
    let manifest = optional_string(object, operation, "manifest")?;
    let first = optional_string(object, operation, first_key)?;
    let second = optional_string(object, operation, second_key)?;
    match (manifest, first, second) {
        (Some(path), None, None) => args.push(path.into()),
        (None, Some(first), Some(second)) => {
            push_flag(args, first_flag, first);
            push_flag(args, second_flag, second);
        }
        (Some(_), _, _) => {
            return Err(invalid(
                operation,
                &format!("'manifest' cannot be combined with '{first_key}' or '{second_key}'"),
            ))
        }
        _ => {
            return Err(invalid(
                operation,
                &format!("provide either 'manifest' or both '{first_key}' and '{second_key}'"),
            ))
        }
    }
    Ok(())
}

fn push_manifest_or_triplet(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    operation: &str,
    direct: [(&str, &str); 3],
) -> Result<(), ProtocolError> {
    let manifest = optional_string(object, operation, "manifest")?;
    let values = [
        optional_string(object, operation, direct[0].0)?,
        optional_string(object, operation, direct[1].0)?,
        optional_string(object, operation, direct[2].0)?,
    ];
    if let Some(path) = manifest {
        if values.iter().any(Option::is_some) {
            return Err(invalid(
                operation,
                "'manifest' cannot be combined with direct experiment inputs",
            ));
        }
        args.push(path.into());
        return Ok(());
    }
    if values.iter().any(Option::is_none) {
        return Err(invalid(
            operation,
            "provide either 'manifest' or all direct experiment inputs",
        ));
    }
    for ((_, flag), value) in direct.into_iter().zip(values) {
        push_flag(
            args,
            flag,
            value.expect("validated direct experiment input"),
        );
    }
    Ok(())
}

fn push_optional_experiment_root(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    operation: &str,
) -> Result<(), ProtocolError> {
    if let Some(root) = optional_string(object, operation, "root")? {
        push_flag(args, "--root", root);
    }
    Ok(())
}

fn push_experiment_tail(
    args: &mut Vec<String>,
    object: &Map<String, Value>,
    operation: &str,
) -> Result<(), ProtocolError> {
    push_optional_experiment_root(args, object, operation)?;
    if optional_bool(object, operation, "summary")?.unwrap_or(false) {
        args.push("--summary".into());
    }
    push_flag(args, "--format", "json");
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
    fn catalog_contains_canonical_and_software_development_tools() {
        let specs = tool_specs();
        assert_eq!(specs.len(), 32);
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
        for expected in [
            "workspace_experiment",
            "causal_replay_experiment",
            "incident_experiment",
            "scientific_experiment",
            "security_coevolution",
            "bug_investigation",
        ] {
            assert!(names.contains(format!("genos_{expected}").as_str()));
        }
        for expected in [
            "diagnose",
            "hypothesis_evidence",
            "solve",
            "evaluate_trajectories",
            "record_decision",
            "blame",
            "invalidate_assumption",
            "record_experience",
            "search_failures",
            "cherry_pick_experience",
            "adversarial_review",
            "future_ci",
            "repository_genome",
            "bisect_agent",
            "analyze_trajectory",
            "compile_memory",
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

    #[test]
    fn diagnose_maps_arrays_to_repeated_safe_arguments() {
        let planned = plan_tool_call(
            "genos_diagnose",
            &json!({"problem":"freeze", "hypotheses":["deadlock", "pool; echo no"]}),
        )
        .unwrap();
        assert_eq!(
            planned.args,
            [
                "dev",
                "diagnose",
                "freeze",
                "--hypothesis",
                "deadlock",
                "--hypothesis",
                "pool; echo no",
                "--root",
                ".genos"
            ]
        );
    }

    #[test]
    fn future_ci_rejects_an_empty_world_set() {
        let error = plan_tool_call("genos_future_ci", &json!({"target":"patch-A", "worlds":[]}))
            .unwrap_err();
        assert!(error.to_string().contains("non-empty"));
    }

    #[test]
    fn workspace_experiment_maps_direct_inputs_without_shell_interpolation() {
        let planned = plan_tool_call(
            "genos_workspace_experiment",
            &json!({"repo":"repo; echo no", "plan":"plans/refactor.yaml", "root":"runs"}),
        )
        .unwrap();
        assert_eq!(
            planned.args,
            [
                "experiment",
                "workspace",
                "--repo",
                "repo; echo no",
                "--plan",
                "plans/refactor.yaml",
                "--root",
                "runs",
                "--format",
                "json"
            ]
        );
    }

    #[test]
    fn incident_experiment_requires_manifest_or_complete_direct_inputs() {
        let error = plan_tool_call(
            "genos_incident_experiment",
            &json!({"snapshot":"production@incident-42", "evidence":"evidence.yaml"}),
        )
        .unwrap_err();
        assert!(error.to_string().contains("all direct experiment inputs"));

        let planned = plan_tool_call(
            "genos_incident_experiment",
            &json!({
                "snapshot":"production@incident-42",
                "evidence":"evidence.yaml",
                "search_plan":"search.yaml",
                "summary":true
            }),
        )
        .unwrap();
        assert_eq!(planned.args[0..2], ["experiment", "incident"]);
        assert!(planned.args.contains(&"--summary".to_string()));
    }

    #[test]
    fn project_experiment_rejects_mixed_manifest_and_direct_inputs() {
        let error = plan_tool_call(
            "genos_bug_investigation",
            &json!({"manifest":"all.yaml", "repo":"service", "plan":"bugs.yaml"}),
        )
        .unwrap_err();
        assert!(error.to_string().contains("cannot be combined"));
    }
}
