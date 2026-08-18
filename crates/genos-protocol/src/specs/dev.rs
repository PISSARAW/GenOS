use serde_json::json;

use crate::schema::{object_schema, root_schema, string_array_schema, string_schema};
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn dev_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("diagnose", "Diagnose with hypotheses", "Create a falsification-oriented hypothesis tree before changing code.")
            .schema(object_schema(
                [
                    ("problem", string_schema("Problem to diagnose.")),
                    ("hypotheses", string_array_schema("Competing falsifiable hypotheses.")),
                    ("root", root_schema()),
                ],
                &["problem", "hypotheses"],
            ))
            .build(),
        SpecBuilder::new("hypothesis_evidence", "Add hypothesis evidence", "Attach provenance-bearing evidence and update a hypothesis confidence/status.")
            .schema(object_schema(
                [
                    ("diagnosis_id", string_schema("Diagnosis identifier.")),
                    ("hypothesis_id", string_schema("Hypothesis identifier.")),
                    ("claim", string_schema("Evidence claim.")),
                    ("source", string_schema("Evidence source.")),
                    ("artifact", string_schema("Optional artifact reference.")),
                    ("against", json!({"type":"boolean","default":false})),
                    ("confidence", json!({"type":"number","minimum":0,"maximum":1})),
                    ("root", root_schema()),
                ],
                &["diagnosis_id", "hypothesis_id", "claim", "source", "confidence"],
            ))
            .build(),
        SpecBuilder::new("solve", "Explore solution trajectories", "Create diverse isolated solution trajectories with adaptive compute and minimal-patch support.")
            .schema(object_schema(
                [
                    ("problem", string_schema("Issue or problem.")),
                    ("strategies", string_array_schema("Explicitly diverse strategies.")),
                    ("branches", json!({"type":"integer","minimum":1,"maximum":64,"default":8})),
                    ("minimal_patch", json!({"type":"boolean","default":false})),
                    ("root", root_schema()),
                ],
                &["problem"],
            ))
            .build(),
        SpecBuilder::new("evaluate_trajectories", "Evaluate trajectories", "Score candidates, suspend dominated branches without deleting lineage, and adapt compute/model tiers.")
            .schema(object_schema(
                [
                    ("solve_id", string_schema("Solve run identifier.")),
                    ("scores", string_array_schema("trajectory_id=score values.")),
                    ("keep", json!({"type":"integer","minimum":1,"default":2})),
                    ("root", root_schema()),
                ],
                &["solve_id", "scores"],
            ))
            .build(),
        SpecBuilder::new("record_decision", "Record decision lineage", "Persist a living ADR/decision with assumptions, alternatives, evidence, requirements, code, tests, and hypothesis lineage.")
            .schema(object_schema(
                [
                    ("title", string_schema("Decision title.")),
                    ("alternatives", string_array_schema("Rejected alternatives.")),
                    ("evidence", string_array_schema("Evidence references.")),
                    ("assumptions", string_array_schema("Assumptions to track.")),
                    ("code_refs", string_array_schema("Code references.")),
                    ("test_refs", string_array_schema("Test references.")),
                    ("requirement_refs", string_array_schema("Requirement references.")),
                    ("expected", string_schema("Expected outcome.")),
                    ("observed", string_schema("Observed outcome.")),
                    ("parent_hypothesis", string_schema("Parent hypothesis.")),
                    ("root", root_schema()),
                ],
                &["title"],
            ))
            .build(),
        SpecBuilder::new("blame", "Causal code blame", "Trace a code, test, requirement, or decision reference back to cognitive decisions and evidence.")
            .schema(object_schema(
                [("reference", string_schema("Code/test/requirement/decision reference.")), ("root", root_schema())],
                &["reference"],
            ))
            .read_only()
            .build(),
        SpecBuilder::new("invalidate_assumption", "Invalidate assumption", "Mark an assumption invalid and return affected decisions, code, tests, and requirements.")
            .schema(object_schema(
                [("assumption", string_schema("Assumption text or identifying fragment.")), ("observed", string_schema("Observation that invalidates it.")), ("root", root_schema())],
                &["assumption", "observed"],
            ))
            .build(),
        SpecBuilder::new("record_experience", "Record branch experience", "Persist positive or negative knowledge with context, evidence, and branch provenance.")
            .schema(object_schema(
                [
                    ("strategy", string_schema("Attempted strategy.")),
                    ("context", string_schema("Applicability context.")),
                    ("outcome", string_schema("Observed outcome.")),
                    ("successful", json!({"type":"boolean"})),
                    ("evidence", string_array_schema("Evidence references.")),
                    ("source_branch", string_schema("Origin branch.")),
                    ("root", root_schema()),
                ],
                &["strategy", "context", "outcome", "successful"],
            ))
            .build(),
        SpecBuilder::new("search_failures", "Search failed approaches", "Find negative knowledge before agents retry a known-bad strategy.")
            .schema(object_schema(
                [("query", string_schema("Context or strategy query.")), ("root", root_schema())],
                &["query"],
            ))
            .read_only()
            .build(),
        SpecBuilder::new("cherry_pick_experience", "Cherry-pick experience", "Transfer one provenance-preserving discovery without copying an entire branch context.")
            .schema(object_schema(
                [("experience_id", string_schema("Experience artifact.")), ("to_branch", string_schema("Receiving branch."))],
                &["experience_id", "to_branch"],
            ))
            .build(),
        SpecBuilder::new("adversarial_review", "Adversarial review", "Plan blind, diverse security/correctness/performance review and counterfactual tests across worlds.")
            .schema(object_schema(
                [
                    ("target", string_schema("Patch or trajectory to review.")),
                    ("critics", string_array_schema("Specialized reviewer roles/models.")),
                    ("worlds", string_array_schema("Counterfactual worlds.")),
                    ("rounds", json!({"type":"integer","minimum":1,"default":1})),
                    ("blind", json!({"type":"boolean","default":true})),
                    ("root", root_schema()),
                ],
                &["target"],
            ))
            .build(),
        SpecBuilder::new("future_ci", "Plan future CI", "Verify code across plausible worlds, dependency futures, and autonomous migration targets.")
            .schema(object_schema(
                [
                    ("target", string_schema("Patch, PR, or branch.")),
                    ("worlds", string_array_schema("Future worlds.")),
                    ("agents", string_array_schema("Verification specializations.")),
                    ("dependency", string_schema("Dependency future, e.g. react@next.")),
                    ("migration_from", string_schema("Migration source.")),
                    ("migration_to", string_schema("Migration target.")),
                    ("root", root_schema()),
                ],
                &["target", "worlds"],
            ))
            .build(),
        SpecBuilder::new("repository_genome", "Update repository genome", "Persist architecture, conventions, invariants, policies, vocabulary, and forbidden patterns for all coding branches.")
            .schema(object_schema(
                [
                    ("architecture", string_array_schema("Architecture facts.")),
                    ("conventions", string_array_schema("Repository conventions.")),
                    ("invariants", string_array_schema("Architecture invariants.")),
                    ("security_rules", string_array_schema("Security rules.")),
                    ("testing_policy", string_array_schema("Testing policy.")),
                    ("performance_requirements", string_array_schema("Performance constraints.")),
                    ("domain_language", string_array_schema("Domain vocabulary.")),
                    ("forbidden_patterns", string_array_schema("Forbidden patterns.")),
                    ("root", root_schema()),
                ],
                &[],
            ))
            .build(),
        SpecBuilder::new("bisect_agent", "Bisect agent trajectory", "Locate the first bad event, belief, memory, or world observation in an ordered trajectory.")
            .schema(object_schema(
                [("states", string_array_schema("Ordered label=good|bad observations.")), ("dimension", string_schema("events, beliefs, memory, or world."))],
                &["states"],
            ))
            .read_only()
            .build(),
        SpecBuilder::new("analyze_trajectory", "Analyze coding trajectory", "Detect the first regression, repeated failed edits, cognitive loops, and the safest automatic revert point.")
            .schema(object_schema(
                [("steps", string_array_schema("Ordered snapshot|good|action_signature|belief_signature steps."))],
                &["steps"],
            ))
            .read_only()
            .build(),
        SpecBuilder::new("compile_memory", "Compile development memory", "Garbage-collect context into facts, decisions, failures, constraints, questions, and source references.")
            .schema(object_schema(
                [
                    ("facts", string_array_schema("Verified facts.")),
                    ("decisions", string_array_schema("Active decisions.")),
                    ("failures", string_array_schema("Negative knowledge.")),
                    ("constraints", string_array_schema("Active constraints.")),
                    ("open_questions", string_array_schema("Open questions.")),
                    ("source_refs", string_array_schema("Original evidence references.")),
                    ("root", root_schema()),
                ],
                &[],
            ))
            .build(),
    ]
}
