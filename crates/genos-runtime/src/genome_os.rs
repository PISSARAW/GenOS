use async_trait::async_trait;
use genos_core::{
    checkpoint_snapshot, AgentEvent, AgentWorldCapsule, BranchId, CapsuleLifecycle, CapsuleRelation,
};
use genos_store::CapsuleStore;
use genos_world::WorldProvider;
use serde::{Deserialize, Serialize};

use crate::{
    apply_cognitive_merge, fork_lineaged_counterfactual_capsules, merge_experiences,
    terminate_capsule, BranchExperience, ClaimRelation, CognitiveMergeApplication,
    CognitiveMergeConfig, CognitiveMergeReport, LineagedCounterfactualBranchSpec,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentGenerationLineage {
    pub agent_uri: String,
    pub generation: u64,
    pub generation_id: String,
}

impl AgentGenerationLineage {
    pub fn new(agent_uri: impl Into<String>, generation: u64) -> Result<Self, String> {
        let agent_uri = agent_uri.into().trim_end_matches('/').to_string();
        let name = agent_uri.strip_prefix("agent://").unwrap_or_default();
        if !uri_segment_is_safe(name) {
            return Err(
                "agent lineage URI must start with agent:// and contain a name".to_string(),
            );
        }
        Ok(Self {
            generation_id: format!("{agent_uri}/generation/{generation}"),
            agent_uri,
            generation,
        })
    }

    pub fn fork_id(&self, label: &str) -> Result<BranchId, String> {
        if !uri_segment_is_safe(label) {
            return Err("fork label must be non-empty and URI-safe".to_string());
        }
        Ok(BranchId(format!(
            "{}/fork/{}-{label}",
            self.generation_id, self.generation
        )))
    }
}

fn uri_segment_is_safe(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GenomeOsForkPlan {
    pub label: String,
    pub hypothesis: String,
}

#[async_trait]
pub trait CounterfactualExperienceRunner: Send + Sync {
    async fn run_experience(&self, capsule: &AgentWorldCapsule)
        -> anyhow::Result<BranchExperience>;
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GenomeOsForkOutcome {
    pub lineage_id: BranchId,
    pub initial_capsule: AgentWorldCapsule,
    pub terminal_capsule: AgentWorldCapsule,
    pub experience: BranchExperience,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GenomeOsCycleReport {
    pub lineage: AgentGenerationLineage,
    pub state_s0: AgentWorldCapsule,
    pub state_s0_checkpoint_event: AgentEvent,
    pub forks: Vec<GenomeOsForkOutcome>,
    pub cognitive_merge: CognitiveMergeReport,
    pub merge_application: CognitiveMergeApplication,
    pub state_s1: AgentWorldCapsule,
}

/// Execute one complete Agent Genome + Counterfactual OS generation:
/// checkpoint S0, fork isolated agent-world capsules, collect experiences,
/// terminate temporary worlds, merge knowledge, and checkpoint S1.
#[allow(clippy::too_many_arguments)]
pub async fn run_genome_os_cycle(
    provider: &dyn WorldProvider,
    store: &dyn CapsuleStore,
    parent: &AgentWorldCapsule,
    lineage: AgentGenerationLineage,
    plans: &[GenomeOsForkPlan],
    runner: &dyn CounterfactualExperienceRunner,
    relations: &[ClaimRelation],
    merge_config: &CognitiveMergeConfig,
) -> anyhow::Result<GenomeOsCycleReport> {
    if plans.is_empty() {
        anyhow::bail!("a Genome OS cycle requires at least one fork plan");
    }
    let parent_world = parent
        .live_world_id
        .clone()
        .ok_or_else(|| anyhow::anyhow!("parent capsule has no live world"))?;
    let world_snapshot = provider.snapshot(parent_world.clone()).await?;
    let agent_checkpoint = checkpoint_snapshot(&parent.agent_snapshot);
    let state_s0 = AgentWorldCapsule::new(
        agent_checkpoint.snapshot,
        world_snapshot,
        Some(parent_world),
        parent.components.clone(),
        Some(parent.capsule_id.clone()),
        CapsuleRelation::Checkpoint,
    );
    store.save_capsule(state_s0.clone()).await?;

    let fork_specs = plans
        .iter()
        .map(|plan| {
            Ok(LineagedCounterfactualBranchSpec {
                branch_id: lineage.fork_id(&plan.label)?,
                label: plan.label.clone(),
                hypothesis: plan.hypothesis.clone(),
            })
        })
        .collect::<Result<Vec<_>, String>>()
        .map_err(anyhow::Error::msg)?;
    let fork_capsules =
        fork_lineaged_counterfactual_capsules(provider, store, &state_s0, &fork_specs).await?;

    let mut experiences = Vec::with_capacity(fork_capsules.len());
    let mut run_error = None;
    for capsule in &fork_capsules {
        match runner.run_experience(capsule).await {
            Ok(experience) if experience.branch_id == capsule.branch_id => {
                experiences.push(experience)
            }
            Ok(_) => {
                run_error = Some(anyhow::anyhow!(
                    "experience runner returned a mismatched branch id"
                ));
                break;
            }
            Err(error) => {
                run_error = Some(error);
                break;
            }
        }
    }

    let mut terminal_capsules = Vec::with_capacity(fork_capsules.len());
    let mut cleanup_error = None;
    for capsule in &fork_capsules {
        match terminate_capsule(provider, store, capsule, CapsuleLifecycle::Cancelled).await {
            Ok(terminal) => terminal_capsules.push(terminal),
            Err(error) if cleanup_error.is_none() => cleanup_error = Some(error),
            Err(_) => {}
        }
    }
    if let Some(error) = run_error.or(cleanup_error) {
        return Err(error);
    }

    let cognitive_merge =
        merge_experiences(&experiences, relations, merge_config).map_err(anyhow::Error::msg)?;
    let merge_application = apply_cognitive_merge(&state_s0.agent_snapshot, &cognitive_merge);
    let state_s1 = AgentWorldCapsule::new(
        merge_application.snapshot.clone(),
        state_s0.world_snapshot_id.clone(),
        state_s0.live_world_id.clone(),
        state_s0.components.clone(),
        Some(state_s0.capsule_id.clone()),
        CapsuleRelation::Merge,
    );
    store.save_capsule(state_s1.clone()).await?;

    let forks = fork_capsules
        .into_iter()
        .zip(terminal_capsules)
        .zip(experiences)
        .map(
            |((initial_capsule, terminal_capsule), experience)| GenomeOsForkOutcome {
                lineage_id: initial_capsule.branch_id.clone(),
                initial_capsule,
                terminal_capsule,
                experience,
            },
        )
        .collect();
    Ok(GenomeOsCycleReport {
        lineage,
        state_s0,
        state_s0_checkpoint_event: agent_checkpoint.event,
        forks,
        cognitive_merge,
        merge_application,
        state_s1,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{default_capsule_components, CognitiveClaim, EpistemicKind};
    use genos_core::{AgentWorldCapsule, CapsuleRelation};
    use genos_store::{CapsuleStore, LocalCapsuleStore};
    use genos_world::{DirectoryWorldProvider, WorldProvider};
    use tempfile::tempdir;

    struct StaticRunner;

    struct FailingRunner;

    #[async_trait]
    impl CounterfactualExperienceRunner for FailingRunner {
        async fn run_experience(
            &self,
            _capsule: &AgentWorldCapsule,
        ) -> anyhow::Result<BranchExperience> {
            anyhow::bail!("simulated branch failure")
        }
    }

    #[async_trait]
    impl CounterfactualExperienceRunner for StaticRunner {
        async fn run_experience(
            &self,
            capsule: &AgentWorldCapsule,
        ) -> anyhow::Result<BranchExperience> {
            let label = capsule
                .agent_snapshot
                .branch_metadata
                .label
                .as_deref()
                .unwrap_or("unknown")
                .to_string();
            let (subject, predicate, object, statement, confidence) = match label.as_str() {
                "A" => (
                    "redis",
                    "useful",
                    "false",
                    "Redis appears unnecessary",
                    0.90,
                ),
                "B" => ("redis", "useful", "true", "Redis reduces contention", 0.95),
                _ => (
                    "contention",
                    "root_cause",
                    "postgresql",
                    "PostgreSQL is the likely root cause",
                    0.92,
                ),
            };
            Ok(BranchExperience {
                branch_id: capsule.branch_id.clone(),
                conditions: vec![format!("condition-{label}")],
                observations: vec![],
                actions: vec![],
                results: vec![],
                beliefs_created: vec![CognitiveClaim {
                    claim_id: format!("claim-{label}"),
                    branch_id: capsule.branch_id.clone(),
                    subject: subject.to_string(),
                    predicate: predicate.to_string(),
                    object_value: object.to_string(),
                    confidence,
                    evidence: vec![format!("evidence-{label}")],
                    kind: EpistemicKind::Discovery,
                    statement: statement.to_string(),
                    conditions: vec![],
                }],
                beliefs_modified: vec![],
                failures: vec![],
                discoveries: vec![],
                uncertainty: vec![],
                evidence: vec![],
            })
        }
    }

    #[tokio::test]
    async fn complete_generation_checkpoints_forks_merges_and_checkpoints_again() {
        let temp = tempdir().unwrap();
        let provider = DirectoryWorldProvider::new(temp.path().join("worlds"), None).unwrap();
        let store = LocalCapsuleStore::new(temp.path().join("capsules.jsonl"));
        let snapshot = crate::test_support::snapshot();
        let world_id = provider
            .create(snapshot.agent_id.clone(), snapshot.branch_id.clone())
            .await
            .unwrap();
        let world_snapshot = provider.snapshot(world_id.clone()).await.unwrap();
        let mut parent = AgentWorldCapsule::new(
            snapshot,
            world_snapshot,
            Some(world_id),
            default_capsule_components(),
            None,
            CapsuleRelation::Genesis,
        );
        parent
            .transition(genos_core::CapsuleLifecycle::Running)
            .unwrap();
        store.save_capsule(parent.clone()).await.unwrap();
        let lineage = AgentGenerationLineage::new("agent://bruney-ai", 124).unwrap();
        let plans = ["A", "B", "C"]
            .into_iter()
            .map(|label| GenomeOsForkPlan {
                label: label.to_string(),
                hypothesis: format!("hypothesis-{label}"),
            })
            .collect::<Vec<_>>();
        let relations = vec![ClaimRelation {
            from_claim: "claim-A".to_string(),
            to_claim: "claim-B".to_string(),
            kind: crate::ClaimRelationKind::Contradicts,
            confidence: 0.9,
            evidence: vec!["different conditions".to_string()],
        }];
        let report = run_genome_os_cycle(
            &provider,
            &store,
            &parent,
            lineage,
            &plans,
            &StaticRunner,
            &relations,
            &CognitiveMergeConfig::default(),
        )
        .await
        .unwrap();
        assert_eq!(
            report.lineage.generation_id,
            "agent://bruney-ai/generation/124"
        );
        assert_eq!(report.forks.len(), 3);
        assert_eq!(
            report.forks[0].lineage_id.0,
            "agent://bruney-ai/generation/124/fork/124-A"
        );
        assert!(report
            .forks
            .iter()
            .all(|fork| fork.terminal_capsule.live_world_id.is_none()));
        assert_ne!(
            report.state_s0.agent_snapshot.snapshot_id,
            report.state_s1.agent_snapshot.snapshot_id
        );
        assert_eq!(report.state_s1.relation, CapsuleRelation::Merge);
        assert_eq!(report.state_s1.agent_snapshot.state.beliefs.len(), 3);
        assert_eq!(report.cognitive_merge.disputed.len(), 2);
        assert_eq!(report.cognitive_merge.accepted.len(), 1);
        assert!(store
            .get_capsule(report.state_s1.capsule_id.0.clone())
            .await
            .unwrap()
            .is_some());
    }

    #[tokio::test]
    async fn failed_cycle_terminates_every_temporary_world() {
        let temp = tempdir().unwrap();
        let provider_root = temp.path().join("provider");
        let provider = DirectoryWorldProvider::new(provider_root.clone(), None).unwrap();
        let store = LocalCapsuleStore::new(temp.path().join("capsules.jsonl"));
        let snapshot = crate::test_support::snapshot();
        let world_id = provider
            .create(snapshot.agent_id.clone(), snapshot.branch_id.clone())
            .await
            .unwrap();
        let world_snapshot = provider.snapshot(world_id.clone()).await.unwrap();
        let mut parent = AgentWorldCapsule::new(
            snapshot,
            world_snapshot,
            Some(world_id),
            default_capsule_components(),
            None,
            CapsuleRelation::Genesis,
        );
        parent
            .transition(genos_core::CapsuleLifecycle::Running)
            .unwrap();
        let plans = ["A", "B", "C"]
            .into_iter()
            .map(|label| GenomeOsForkPlan {
                label: label.to_string(),
                hypothesis: label.to_string(),
            })
            .collect::<Vec<_>>();
        let result = run_genome_os_cycle(
            &provider,
            &store,
            &parent,
            AgentGenerationLineage::new("agent://cleanup-test", 1).unwrap(),
            &plans,
            &FailingRunner,
            &[],
            &CognitiveMergeConfig::default(),
        )
        .await;
        assert!(result.is_err());
        assert_eq!(
            std::fs::read_dir(provider_root.join("worlds"))
                .unwrap()
                .count(),
            1
        );
    }
}
