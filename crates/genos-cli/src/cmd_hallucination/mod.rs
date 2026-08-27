mod audit;
mod reports;
mod supervision;

pub use audit::{cmd_hallucination_detect, cmd_hallucination_inject};
pub use reports::*;
pub use supervision::{
    cmd_hallucination_analyze, cmd_hallucination_correct, cmd_hallucination_extract,
    cmd_hallucination_simulate, cmd_hallucination_test,
};

use crate::resolve::{resolve_snapshot_ref, snapshot_store_from};
use anyhow::{Context, Result};
use genos_core::{AgentSnapshot, Belief, ToolOutputRecord};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct HallucinationFinding {
    pub kind: String,
    pub subject: String,
    pub detail: String,
}

async fn load_snapshot(
    spec: &str,
    snapshots: Option<PathBuf>,
    root: &Path,
) -> Result<(AgentSnapshot, PathBuf)> {
    let store = snapshot_store_from(snapshots.clone().map(|p| p.display().to_string()), root).await.unwrap();
    let snapshot = resolve_snapshot_ref(spec, &*store).await?;
    Ok((snapshot, PathBuf::from("<dynamic>")))
}

fn receipt_is_verified(receipt: &Option<genos_core::ExecutionReceipt>) -> bool {
    receipt
        .as_ref()
        .is_some_and(|receipt| receipt.verified_by_env)
}

/// A belief counts as grounded only when every piece of evidence points at a
/// recorded, successful tool output whose execution receipt the environment
/// verified. Note-only evidence cannot be externally checked, so it does not
/// ground a claim.
pub(crate) fn belief_is_grounded(belief: &Belief, outputs: &[ToolOutputRecord]) -> bool {
    !belief.evidence.is_empty()
        && belief
            .evidence
            .iter()
            .all(|evidence| match evidence.tool_output_id() {
                None => false,
                Some(tool_output_id) => outputs
                    .iter()
                    .find(|output| &output.id == tool_output_id)
                    .is_some_and(|output| output.success && receipt_is_verified(&output.receipt)),
            })
}

pub(crate) fn audit_snapshot(snapshot: &AgentSnapshot) -> Vec<HallucinationFinding> {
    let mut findings = Vec::new();
    let outputs = &snapshot.state.tool_outputs;

    for output in outputs {
        if output.receipt.is_none() {
            findings.push(HallucinationFinding {
                kind: "missing_receipt".into(),
                subject: output.id.0.clone(),
                detail: format!(
                    "tool '{}' produced output without an execution receipt",
                    output.tool_name
                ),
            });
        } else if !receipt_is_verified(&output.receipt) {
            findings.push(HallucinationFinding {
                kind: "unverified_execution".into(),
                subject: output.id.0.clone(),
                detail: format!(
                    "tool '{}' executed without environment verification",
                    output.tool_name
                ),
            });
        }
    }

    for belief in &snapshot.state.beliefs {
        if belief.evidence.is_empty() {
            findings.push(HallucinationFinding {
                kind: "ungrounded_belief".into(),
                subject: belief.id.0.clone(),
                detail: format!(
                    "belief '{} {} {}' carries no evidence",
                    belief.subject, belief.predicate, belief.object_value
                ),
            });
            continue;
        }

        let mut problems = Vec::new();
        for evidence in &belief.evidence {
            match evidence.tool_output_id() {
                None => problems.push("note evidence cannot be externally verified".to_string()),
                Some(tool_output_id) => {
                    match outputs.iter().find(|output| &output.id == tool_output_id) {
                        None => problems.push(format!(
                            "dangling evidence reference '{}'",
                            tool_output_id.0
                        )),
                        Some(output) => {
                            if !output.success {
                                problems.push(format!(
                                    "evidence '{}' comes from a failed tool call",
                                    tool_output_id.0
                                ));
                            }
                            if !receipt_is_verified(&output.receipt) {
                                problems.push(format!(
                                    "evidence '{}' lacks a verified execution receipt",
                                    tool_output_id.0
                                ));
                            }
                        }
                    }
                }
            }
        }
        if !problems.is_empty() {
            findings.push(HallucinationFinding {
                kind: "weak_evidence".into(),
                subject: belief.id.0.clone(),
                detail: format!("belief '{}': {}", belief.subject, problems.join("; ")),
            });
        }
    }

    findings
}

pub(crate) fn read_structured_file(path: &Path) -> Result<Value> {
    let raw =
        fs::read_to_string(path).with_context(|| format!("reading suite {}", path.display()))?;
    if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
        serde_json::from_str(&raw).with_context(|| format!("parsing {}", path.display()))
    } else {
        serde_yaml::from_str(&raw).with_context(|| format!("parsing {}", path.display()))
    }
}
