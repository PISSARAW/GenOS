use super::HallucinationFinding;
use genos_core::BeliefStatus;
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
pub struct HallucinationDetectOutput {
    pub source: String,
    pub tool_output_count: usize,
    pub belief_count: usize,
    pub finding_count: usize,
    pub findings: Vec<HallucinationFinding>,
}

#[derive(Serialize)]
pub struct HallucinationInjectOutput {
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    pub belief_id: String,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f32,
    pub kind: String,
    pub status: BeliefStatus,
    pub out_path: Option<String>,
    pub snapshot_store_path: Option<String>,
    pub event_id: Option<String>,
    pub event_sequence: Option<u64>,
}

#[derive(Serialize)]
pub struct HallucinationCaseResult {
    pub subject: String,
    pub predicate: Option<String>,
    pub object: Option<String>,
    pub expect: String,
    pub actual: String,
    pub pass: bool,
}

#[derive(Serialize)]
pub struct HallucinationTestOutput {
    pub suite_path: String,
    pub case_count: usize,
    pub passed: usize,
    pub failed: usize,
    pub results: Vec<HallucinationCaseResult>,
}

#[derive(Serialize)]
pub struct ExtractNode {
    pub belief_id: String,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f32,
    pub status: String,
    pub evidence: Vec<String>,
}

#[derive(Serialize)]
pub struct ExtractEdge {
    pub from: String,
    pub to: String,
    pub relation: String,
}

#[derive(Serialize)]
pub struct HallucinationExtractOutput {
    pub snapshot_id: String,
    pub branch_id: String,
    pub nodes: Vec<ExtractNode>,
    pub edges: Vec<ExtractEdge>,
}

#[derive(Serialize)]
pub struct HallucinationAnalyzeOutput {
    pub snapshot_id: String,
    pub branch_id: String,
    pub belief_count: usize,
    pub grounded: usize,
    pub ungrounded: usize,
    pub grounded_ratio: f32,
    pub confidence_entropy_bits: f64,
    pub status_counts: BTreeMap<String, usize>,
    pub verdict: String,
}

#[derive(Serialize)]
pub struct HallucinationCorrectOutput {
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    pub rejected_belief_ids: Vec<String>,
    pub rejection_count: usize,
    pub remaining_grounded: usize,
    pub out_path: Option<String>,
    pub snapshot_store_path: Option<String>,
}

#[derive(Serialize)]
pub struct HallucinationSimulateOutput {
    pub model: String,
    pub parent_snapshot_id: String,
    pub injected_subject: String,
    pub injected_belief_id: String,
    pub findings_before_injection: usize,
    pub findings_after_injection: usize,
    pub detected: bool,
    pub findings: Vec<HallucinationFinding>,
}
