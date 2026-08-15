use crate::{
    checkpoint_capsule, default_capsule_components, fork_lineaged_counterfactual_capsules,
    initialize_project_snapshot, LineagedCounterfactualBranchSpec, LongRunningBranchOutcome,
    VerificationOutcome,
};
use anyhow::{bail, Context};
use chrono::Utc;
use genos_core::{
    build_lineage_dag, AgentEvent, AgentEventType, AgentWorldCapsule, BranchId, CapsuleLifecycle,
    CapsuleRelation, CorrelationId, EventId, LineageDag, SnapshotId,
};
use genos_eval::{
    synthesize_refactor_experiment, CognitiveMergeResult, ObjectiveWeight, RefactorBranchEvaluation,
};
use genos_store::{CapsuleStore, LocalCapsuleStore};
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

fn root_parent() -> String {
    "S0".to_string()
}

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
    pub primitive_trace: crate::AgentPrimitiveTrace,
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
        .create(genos_core::AgentId::new(), BranchId("S0".to_string()))
        .await?;
    let root_world_snapshot = provider.snapshot(root_world.clone()).await?;
    let root_agent_snapshot = initialize_project_snapshot(
        &manifest.name,
        "workspace-experiment",
        root_world.clone(),
        BranchId("S0".to_string()),
        100,
    );
    let mut root_capsule = AgentWorldCapsule::new(
        root_agent_snapshot,
        root_world_snapshot,
        Some(root_world.clone()),
        default_capsule_components(),
        None,
        CapsuleRelation::Genesis,
    );
    root_capsule
        .transition(CapsuleLifecycle::Running)
        .map_err(anyhow::Error::msg)?;
    let capsule_store = LocalCapsuleStore::new(state_root.as_ref().join("capsules.jsonl"));
    capsule_store.save_capsule(root_capsule.clone()).await?;
    let root_snapshot = root_capsule.agent_snapshot.snapshot_id.clone();
    let mut primitive_trace = crate::AgentPrimitiveTrace::default();
    primitive_trace.completed(
        crate::AgentPrimitive::Init,
        manifest.name.clone(),
        json!({ "seed_dir": manifest.seed_dir }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Snapshot,
        "S0",
        json!({ "snapshot_id": root_snapshot.0.clone() }),
    );
    let mut capsules = HashMap::from([("S0".to_string(), root_capsule)]);
    let correlation_id = CorrelationId::new();
    let mut lineage_events = Vec::new();
    let mut outcomes = Vec::new();

    for (index, spec) in manifest.branches.into_iter().enumerate() {
        let parent = capsules.get(&spec.parent).cloned().with_context(|| {
            format!(
                "branch {} references unavailable parent {}; manifests must be parent-first",
                spec.id, spec.parent
            )
        })?;
        if capsules.contains_key(&spec.id) {
            bail!("duplicate branch id {}", spec.id);
        }
        let mut fork = fork_lineaged_counterfactual_capsules(
            &provider,
            &capsule_store,
            &parent,
            &[LineagedCounterfactualBranchSpec {
                branch_id: BranchId(spec.id.clone()),
                label: spec.label.clone(),
                hypothesis: spec.hypothesis.clone(),
            }],
        )
        .await?
        .pop()
        .expect("one fork requested");
        let world_id = fork
            .live_world_id
            .clone()
            .context("fork has no live world")?;
        for edit in &spec.edits {
            provider
                .write_file(&world_id, &edit.relative_path, &edit.contents)
                .await?;
        }
        let diff = provider.diff(root_world.clone(), world_id.clone()).await?;
        let mut verifications = Vec::new();
        for stage in &spec.verifications {
            let execution = provider.execute(world_id.clone(), &stage.command).await?;
            fork.consume_step(EventId::new())
                .map_err(anyhow::Error::msg)?;
            capsule_store.save_capsule(fork.clone()).await?;
            let passed = execution.exit_code == 0;
            verifications.push(VerificationOutcome {
                kind: stage.kind.clone(),
                exit_code: execution.exit_code,
                passed,
                stdout: execution.stdout,
                stderr: execution.stderr,
            });
            if !passed {
                break;
            }
        }
        let checkpoint = checkpoint_capsule(&provider, &capsule_store, &fork).await?;
        let outcome = LongRunningBranchOutcome {
            branch_id: checkpoint.branch_id.clone(),
            label: spec.label.clone(),
            hypothesis: spec.hypothesis.clone(),
            world_id,
            verifications,
            files_changed: diff.files_changed,
        };
        primitive_trace.completed(
            crate::AgentPrimitive::Fork,
            spec.id.clone(),
            json!({ "parent": spec.parent, "hypothesis": outcome.hypothesis.clone() }),
        );
        for verification in &outcome.verifications {
            let details = json!({
                "kind": verification.kind,
                "exit_code": verification.exit_code,
                "passed": verification.passed,
            });
            if verification.passed {
                primitive_trace.completed(crate::AgentPrimitive::Run, spec.id.clone(), details);
            } else {
                primitive_trace.failed(crate::AgentPrimitive::Run, spec.id.clone(), details);
            }
        }
        primitive_trace.completed(
            crate::AgentPrimitive::Diff,
            spec.id.clone(),
            json!({ "files_changed": outcome.files_changed }),
        );
        lineage_events.push(AgentEvent {
            event_id: EventId::new(),
            agent_id: checkpoint.agent_snapshot.agent_id.clone(),
            branch_id: Some(BranchId(spec.id.clone())),
            sequence: index as u64 + 1,
            timestamp: Utc::now(),
            event_type: AgentEventType::ForkCreated,
            payload: json!({
                "parent_snapshot_id": parent.agent_snapshot.snapshot_id.0.clone(),
                "fork_snapshot_id": checkpoint.agent_snapshot.snapshot_id.0.clone(),
                "branch_id": spec.id.clone(),
                "label": spec.label.clone(),
            }),
            causation_id: None,
            correlation_id: Some(correlation_id.clone()),
        });
        capsules.insert(spec.id, checkpoint);
        outcomes.push(outcome);
    }

    let eligible = outcomes
        .iter()
        .filter(|outcome| {
            !outcome.verifications.is_empty()
                && outcome
                    .verifications
                    .iter()
                    .all(|verification| verification.passed)
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
    match &synthesis {
        Some(result) => primitive_trace.completed(
            crate::AgentPrimitive::Merge,
            result.selected_branch.0.clone(),
            json!({ "reused_discoveries": result.reused_discoveries.len() }),
        ),
        None => primitive_trace.deferred(
            crate::AgentPrimitive::Merge,
            manifest.name.clone(),
            json!({ "reason": "no eligible evaluated branch" }),
        ),
    }
    primitive_trace.completed(
        crate::AgentPrimitive::Lineage,
        manifest.name.clone(),
        json!({ "edges": lineage_events.len() }),
    );
    Ok(WorkspaceExperimentReport {
        name: manifest.name,
        root_snapshot_id: root_snapshot,
        branch_outcomes: outcomes,
        lineage: build_lineage_dag(&lineage_events),
        synthesis,
        primitive_trace,
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

pub fn run_temporal_experiment(
    manifest: TemporalExperimentManifest,
) -> crate::TemporalCausalReport {
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
