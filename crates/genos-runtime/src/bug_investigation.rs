use anyhow::bail;
use chrono::{Duration, Utc};
use genos_core::{
    AgentId, BranchId, LineageDag, LineageEdge, LineageRelation, SnapshotId, WorldId,
};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BugProbeKind {
    Test,
    Trace,
    Reproduction,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BugProbeSpec {
    pub evidence_id: String,
    pub kind: BugProbeKind,
    pub command: String,
    #[serde(default)]
    pub expected_exit_code: i32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BugCandidateEdit {
    pub relative_path: String,
    pub contents: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BugHypothesisSpec {
    pub id: String,
    pub explanation: String,
    pub candidate_fix: String,
    pub edits: Vec<BugCandidateEdit>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BugInvestigationManifest {
    pub name: String,
    pub bug: String,
    pub seed_dir: PathBuf,
    pub probes: Vec<BugProbeSpec>,
    pub hypotheses: Vec<BugHypothesisSpec>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HypothesisVerdict {
    Supported,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BugEvidence {
    pub evidence_id: String,
    pub kind: BugProbeKind,
    pub command: String,
    pub expected_exit_code: i32,
    pub actual_exit_code: i32,
    pub passed: bool,
    pub stdout: String,
    pub stderr: String,
    pub conclusion: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct HypothesisInvestigation {
    pub hypothesis_id: String,
    pub explanation: String,
    pub candidate_fix: String,
    pub verdict: HypothesisVerdict,
    pub world_id: WorldId,
    pub snapshot_id: SnapshotId,
    pub files_changed: usize,
    pub evidence: Vec<BugEvidence>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExplanationDisposition {
    pub hypothesis_id: String,
    pub verdict: HypothesisVerdict,
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SelectedBugFix {
    pub hypothesis_id: String,
    pub candidate_fix: String,
    pub world_id: WorldId,
    pub snapshot_id: SnapshotId,
    pub files_changed: usize,
    pub confirming_evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BugInvestigationReport {
    pub name: String,
    pub bug: String,
    pub root_snapshot_id: SnapshotId,
    pub baseline_evidence: Vec<BugEvidence>,
    pub investigations: Vec<HypothesisInvestigation>,
    pub explanation_space: Vec<ExplanationDisposition>,
    pub rejected_hypothesis_ids: Vec<String>,
    pub selected_fix: Option<SelectedBugFix>,
    pub selection_note: String,
    pub lineage: LineageDag,
    pub primitive_trace: crate::AgentPrimitiveTrace,
}

/// Falsify competing explanations in isolated code worlds. Every branch runs
/// the same probes and remains available even when its hypothesis is rejected.
pub async fn run_bug_investigation(
    manifest: BugInvestigationManifest,
    state_root: impl AsRef<Path>,
) -> anyhow::Result<BugInvestigationReport> {
    validate(&manifest)?;
    let provider = DirectoryWorldProvider::new(
        state_root.as_ref().join("world-state"),
        Some(manifest.seed_dir.clone()),
    )?;
    let root_world = provider
        .create(AgentId::new(), BranchId("bug-root".to_string()))
        .await?;
    let root_snapshot_id = provider.snapshot(root_world.clone()).await?;
    let baseline_evidence = run_probes(&provider, &root_world, &manifest.probes).await?;
    if baseline_evidence.iter().all(|evidence| evidence.passed) {
        bail!("baseline probes do not reproduce the bug");
    }

    let started = Utc::now();
    let mut primitive_trace = crate::AgentPrimitiveTrace::default();
    primitive_trace.completed(
        crate::AgentPrimitive::Init,
        manifest.name.clone(),
        json!({ "seed_dir": manifest.seed_dir.clone() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Snapshot,
        "bug-root",
        json!({ "snapshot_id": root_snapshot_id.0.clone() }),
    );
    for evidence in &baseline_evidence {
        let details = json!({
            "evidence_id": evidence.evidence_id,
            "exit_code": evidence.actual_exit_code,
            "baseline": true,
        });
        if evidence.passed {
            primitive_trace.completed(crate::AgentPrimitive::Run, "baseline", details);
        } else {
            primitive_trace.failed(crate::AgentPrimitive::Run, "baseline", details);
        }
    }
    let mut lineage = LineageDag::default();
    let mut investigations = Vec::new();
    for (index, hypothesis) in manifest.hypotheses.iter().enumerate() {
        let world_id = provider.fork(root_snapshot_id.clone()).await?;
        for edit in &hypothesis.edits {
            provider
                .write_file(&world_id, &edit.relative_path, &edit.contents)
                .await?;
        }
        let diff = provider.diff(root_world.clone(), world_id.clone()).await?;
        let snapshot_id = provider.snapshot(world_id.clone()).await?;
        let evidence = run_probes(&provider, &world_id, &manifest.probes).await?;
        let verdict = if evidence.iter().all(|item| item.passed) {
            HypothesisVerdict::Supported
        } else {
            HypothesisVerdict::Rejected
        };
        primitive_trace.completed(
            crate::AgentPrimitive::Fork,
            hypothesis.id.clone(),
            json!({ "parent_snapshot": root_snapshot_id.0.clone() }),
        );
        primitive_trace.completed(
            crate::AgentPrimitive::Diff,
            hypothesis.id.clone(),
            json!({ "files_changed": diff.files_changed }),
        );
        for item in &evidence {
            let details = json!({
                "evidence_id": item.evidence_id,
                "exit_code": item.actual_exit_code,
            });
            if item.passed {
                primitive_trace.completed(
                    crate::AgentPrimitive::Run,
                    hypothesis.id.clone(),
                    details,
                );
            } else {
                primitive_trace.failed(crate::AgentPrimitive::Run, hypothesis.id.clone(), details);
            }
        }
        lineage.edges.push(LineageEdge {
            parent_snapshot: root_snapshot_id.clone(),
            child_snapshot: snapshot_id.clone(),
            relation: LineageRelation::Fork,
            created_at: started + Duration::milliseconds(index as i64),
            metadata: json!({
                "hypothesis_id": hypothesis.id,
                "explanation": hypothesis.explanation,
                "verdict": verdict,
                "world_id": world_id,
            }),
        });
        investigations.push(HypothesisInvestigation {
            hypothesis_id: hypothesis.id.clone(),
            explanation: hypothesis.explanation.clone(),
            candidate_fix: hypothesis.candidate_fix.clone(),
            verdict,
            world_id,
            snapshot_id,
            files_changed: diff.files_changed,
            evidence,
        });
    }

    let explanation_space = investigations
        .iter()
        .map(|investigation| ExplanationDisposition {
            hypothesis_id: investigation.hypothesis_id.clone(),
            verdict: investigation.verdict.clone(),
            evidence: investigation
                .evidence
                .iter()
                .map(|evidence| evidence.conclusion.clone())
                .collect(),
        })
        .collect::<Vec<_>>();
    let rejected_hypothesis_ids = investigations
        .iter()
        .filter(|investigation| investigation.verdict == HypothesisVerdict::Rejected)
        .map(|investigation| investigation.hypothesis_id.clone())
        .collect::<Vec<_>>();
    let supported = investigations
        .iter()
        .filter(|investigation| investigation.verdict == HypothesisVerdict::Supported)
        .collect::<Vec<_>>();
    let (selected_fix, selection_note) = match supported.as_slice() {
        [winner] => (
            Some(SelectedBugFix {
                hypothesis_id: winner.hypothesis_id.clone(),
                candidate_fix: winner.candidate_fix.clone(),
                world_id: winner.world_id.clone(),
                snapshot_id: winner.snapshot_id.clone(),
                files_changed: winner.files_changed,
                confirming_evidence: winner
                    .evidence
                    .iter()
                    .map(|evidence| evidence.conclusion.clone())
                    .collect(),
            }),
            format!(
                "{} is the only hypothesis surviving every falsification probe",
                winner.hypothesis_id
            ),
        ),
        [] => (
            None,
            "all hypotheses were rejected; preserve the explanation space and fork new candidates"
                .to_string(),
        ),
        many => (
            None,
            format!(
                "{} hypotheses remain supported; selection is intentionally deferred",
                many.len()
            ),
        ),
    };
    primitive_trace.deferred(
        crate::AgentPrimitive::Merge,
        manifest.name.clone(),
        json!({
            "reason": "winner selection preserves rejected branches; no cognitive state merge requested",
            "supported": supported.len(),
        }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Lineage,
        manifest.name.clone(),
        json!({ "edges": lineage.edges.len() }),
    );

    Ok(BugInvestigationReport {
        name: manifest.name,
        bug: manifest.bug,
        root_snapshot_id,
        baseline_evidence,
        investigations,
        explanation_space,
        rejected_hypothesis_ids,
        selected_fix,
        selection_note,
        lineage,
        primitive_trace,
    })
}

async fn run_probes(
    provider: &DirectoryWorldProvider,
    world_id: &WorldId,
    probes: &[BugProbeSpec],
) -> anyhow::Result<Vec<BugEvidence>> {
    let mut evidence = Vec::new();
    for probe in probes {
        let result = provider.execute(world_id.clone(), &probe.command).await?;
        let passed = result.exit_code == probe.expected_exit_code;
        let outcome = if passed { "passed" } else { "failed" };
        evidence.push(BugEvidence {
            evidence_id: probe.evidence_id.clone(),
            kind: probe.kind.clone(),
            command: probe.command.clone(),
            expected_exit_code: probe.expected_exit_code,
            actual_exit_code: result.exit_code,
            passed,
            stdout: result.stdout,
            stderr: result.stderr,
            conclusion: format!(
                "{}: {} (expected exit {}, got {})",
                probe.evidence_id, outcome, probe.expected_exit_code, result.exit_code
            ),
        });
    }
    Ok(evidence)
}

fn validate(manifest: &BugInvestigationManifest) -> anyhow::Result<()> {
    if manifest.probes.is_empty() || manifest.hypotheses.is_empty() {
        bail!("bug investigations require probes and hypotheses");
    }
    let mut ids = HashSet::new();
    for hypothesis in &manifest.hypotheses {
        if !ids.insert(&hypothesis.id) {
            bail!("duplicate bug hypothesis {}", hypothesis.id);
        }
        if hypothesis.edits.is_empty() {
            bail!("hypothesis {} has no candidate code change", hypothesis.id);
        }
    }
    Ok(())
}
