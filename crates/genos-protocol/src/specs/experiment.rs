use serde_json::json;

use crate::schema::{experiment_root_schema, object_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn experiment_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("workspace_experiment", "Run workspace experiment", "Fork isolated code workspaces, apply planned alternatives, run verification, diff outcomes, evaluate them, and preserve lineage.")
            .schema(object_schema(
                [
                    ("manifest", string_schema("Optional complete workspace experiment manifest.")),
                    ("repo", string_schema("Repository or workspace used as the direct seed.")),
                    ("plan", string_schema("Workspace experiment plan path.")),
                    ("root", experiment_root_schema()),
                ],
                &[],
            ))
            .destructive()
            .build(),
        SpecBuilder::new("causal_replay_experiment", "Run causal replay experiment", "Restore a historical decision point, fork alternative realities, replay known events, and explain causal divergence.")
            .schema(object_schema(
                [
                    ("manifest", string_schema("Causal replay experiment manifest path.")),
                    ("root", experiment_root_schema()),
                ],
                &["manifest"],
            ))
            .build(),
        SpecBuilder::new("incident_experiment", "Reproduce production incident", "Search and recursively refine mutated universes against production incident evidence.")
            .schema(object_schema(
                [
                    ("manifest", string_schema("Optional complete incident search manifest.")),
                    ("snapshot", string_schema("Production snapshot reference.")),
                    ("evidence", string_schema("Incident evidence YAML/JSON path.")),
                    ("search_plan", string_schema("Adaptive search plan path.")),
                    ("root", experiment_root_schema()),
                    ("summary", json!({"type":"boolean","default":false})),
                ],
                &[],
            ))
            .build(),
        SpecBuilder::new("scientific_experiment", "Run scientific experiment", "Version hypotheses, execute protocols, preserve evidence, critique results, reproduce findings, and rewind suspect conclusions.")
            .schema(object_schema(
                [
                    ("manifest", string_schema("Optional complete scientific experiment manifest.")),
                    ("dataset", string_schema("Dataset path supplied at execution time.")),
                    ("research_plan", string_schema("Scientific research plan path.")),
                    ("root", experiment_root_schema()),
                    ("summary", json!({"type":"boolean","default":false})),
                ],
                &[],
            ))
            .build(),
        SpecBuilder::new("security_coevolution", "Run security coevolution", "Co-evolve abstract Red and Blue genomes in isolated simulated environments with neutral observations.")
            .schema(object_schema(
                [
                    ("manifest", string_schema("Optional complete security coevolution manifest.")),
                    ("environment", string_schema("Security scenario environment path.")),
                    ("evolution_plan", string_schema("Evolution plan path.")),
                    ("root", experiment_root_schema()),
                    ("summary", json!({"type":"boolean","default":false})),
                ],
                &[],
            ))
            .build(),
        SpecBuilder::new("bug_investigation", "Investigate unknown-cause bug", "Falsify competing bug explanations in isolated code worlds while preserving rejected hypotheses and evidence.")
            .schema(object_schema(
                [
                    ("manifest", string_schema("Optional complete bug investigation manifest.")),
                    ("repo", string_schema("Repository used as the direct investigation seed.")),
                    ("plan", string_schema("Hypothesis and probe plan path.")),
                    ("root", experiment_root_schema()),
                    ("summary", json!({"type":"boolean","default":false})),
                ],
                &[],
            ))
            .destructive()
            .build(),
    ]
}
