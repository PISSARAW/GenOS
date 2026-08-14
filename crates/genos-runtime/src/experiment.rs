use crate::{run_long_branch, LongRunningBranchOutcome, LongRunningBranchPlan, VerificationPlan, WorkspaceEdit};
use anyhow::{bail, Context};
use chrono::Utc;
use genos_core::{
    build_lineage_dag, AgentEvent, AgentEventType, AgentId, BranchId, CorrelationId, EventId,
    LineageDag, SnapshotId,
};
use genos_eval::{
    synthesize_refactor_experiment, CognitiveMergeResult, ObjectiveWeight,
    RefactorBranchEvaluation,
};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceBranchSpec {
    pub id: String,
    #[serde(default = "root_parent")]
    pub parent: String,
    pub label: String,
    pub hypothesis: String,
    #[serde(default)]
    pub edits: Vec<WorkspaceEditSpec>,
    #[serde(default)]
    pub verifications: Vec<VerificationPlanSpec>,
}

fn root_parent() -> String { "S0".to_string() }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceEditSpec {
    pub relative_path: String,
    pub contents: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerificationPlanSpec {
    pub kind: crate::VerificationKind,
    pub command: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceExperimentManifest {
    pub name: String,
    pub seed_dir: PathBuf,
    pub branches: Vec<WorkspaceBranchSpec>,
    #[serde(default)]
    pub evaluations: Vec<RefactorBranchEvaluation>,
    #[serde(default)]
    pub objective_weights: Vec<ObjectiveWeight>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WorkspaceExperimentReport {
    pub name: String,
    pub root_snapshot_id: SnapshotId,
    pub branch_outcomes: Vec<LongRunningBranchOutcome>,
    pub lineage: LineageDag,
    pub synthesis: Option<CognitiveMergeResult>,
}

pub async fn run_workspace_experiment(
    manifest: WorkspaceExperimentManifest,
    state_root: impl AsRef<Path>,
) -> anyhow::Result<WorkspaceExperimentReport> {
    let provider = DirectoryWorldProvider::new(
        state_root.as_ref().join("world-state"),
        Some(manifest.seed_dir.clone()),
    )?;
    let root_world = provider
        .create(AgentId::new(), BranchId("S0".to_string()))
        .await?;
    let root_snapshot = provider.snapshot(root_world.clone()).await?;
    let mut snapshots = HashMap::from([("S0".to_string(), root_snapshot.clone())]);
    let correlation_id = CorrelationId::new();
    let mut lineage_events = Vec::new();
    let mut outcomes = Vec::new();

    for (index, spec) in manifest.branches.into_iter().enumerate() {
        let parent = snapshots.get(&spec.parent).cloned().with_context(|| {
            format!("branch {} references unavailable parent {}; manifests must be parent-first", spec.id, spec.parent)
        })?;
        if snapshots.contains_key(&spec.id) {
            bail!("duplicate branch id {}", spec.id);
        }
        let plan = LongRunningBranchPlan {
            branch_id: BranchId(spec.id.clone()),
            label: spec.label.clone(),
            hypothesis: spec.hypothesis,
            edits: spec.edits.into_iter().map(|edit| WorkspaceEdit {
                relative_path: edit.relative_path,
                contents: edit.contents,
            }).collect(),
            verifications: spec.verifications.into_iter().map(|stage| VerificationPlan {
                kind: stage.kind,
                command: stage.command,
            }).collect(),
        };
        let outcome = run_long_branch(&provider, &root_world, &parent, plan).await?;
        let child_snapshot = provider.snapshot(outcome.world_id.clone()).await?;
        lineage_events.push(AgentEvent {
            event_id: EventId::new(), agent_id: AgentId::new(),
            branch_id: Some(BranchId(spec.id.clone())), sequence: index as u64 + 1,
            timestamp: Utc::now(), event_type: AgentEventType::ForkCreated,
            payload: json!({
                "parent_snapshot_id": parent.0.clone(),
                "fork_snapshot_id": child_snapshot.0.clone(),
                "branch_id": spec.id.clone(),
                "label": spec.label.clone(),
            }),
            causation_id: None, correlation_id: Some(correlation_id.clone()),
        });
        snapshots.insert(spec.id, child_snapshot);
        outcomes.push(outcome);
    }

    let eligible = outcomes
        .iter()
        .filter(|outcome| {
            !outcome.verifications.is_empty()
                && outcome.verifications.iter().all(|verification| verification.passed)
        })
        .map(|outcome| outcome.branch_id.clone())
        .collect::<HashSet<_>>();
    let eligible_evaluations = manifest
        .evaluations
        .iter()
        .filter(|evaluation| eligible.contains(&evaluation.branch_id))
        .cloned()
        .collect::<Vec<_>>();
    let synthesis = if eligible_evaluations.is_empty() || manifest.objective_weights.is_empty() {
        None
    } else {
        synthesize_refactor_experiment(&eligible_evaluations, &manifest.objective_weights)
    };
    Ok(WorkspaceExperimentReport {
        name: manifest.name,
        root_snapshot_id: root_snapshot,
        branch_outcomes: outcomes,
        lineage: build_lineage_dag(&lineage_events),
        synthesis,
    })
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemporalExperimentManifest {
    pub name: String,
    pub checkpoint: crate::TemporalCheckpoint,
    pub history_end: chrono::DateTime<Utc>,
    pub observations: Vec<crate::HistoricalObservation>,
    pub universes: Vec<crate::CounterfactualUniverse>,
}

pub fn run_temporal_experiment(manifest: TemporalExperimentManifest) -> crate::TemporalCausalReport {
    crate::replay_counterfactual_history(
        manifest.checkpoint,
        manifest.history_end,
        &manifest.observations,
        manifest.universes,
    )
}

pub fn persist_experiment_report<T: Serialize>(
    root: impl AsRef<Path>,
    name: &str,
    report: &T,
) -> anyhow::Result<PathBuf> {
    let reports = root.as_ref().join("reports");
    std::fs::create_dir_all(&reports)?;
    let path = reports.join(format!("{name}.json"));
    std::fs::write(&path, serde_json::to_vec_pretty(report)?)?;
    Ok(path)
}
