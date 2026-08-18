use super::*;
use async_trait::async_trait;
use crate::{
    default_capsule_components, BranchExperience, ClaimRelation, CognitiveClaim,
    CognitiveMergeConfig, EpistemicKind,
};
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
