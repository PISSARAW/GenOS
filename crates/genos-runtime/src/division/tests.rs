use super::*;
use genos_core::{AgentWorldCapsule, CapsuleLifecycle, CapsuleRelation};
use genos_store::{CapsuleStore, LocalCapsuleStore};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use tempfile::tempdir;

async fn genesis_capsule(
    provider: &DirectoryWorldProvider,
    store: &LocalCapsuleStore,
    budget_steps: u64,
) -> anyhow::Result<AgentWorldCapsule> {
    let snapshot = crate::test_support::snapshot();
    let world_id = provider
        .create(snapshot.agent_id.clone(), snapshot.branch_id.clone())
        .await?;
    let world_snapshot = provider.snapshot(world_id.clone()).await?;
    let mut capsule = AgentWorldCapsule::new(
        snapshot,
        world_snapshot,
        Some(world_id),
        crate::capsules::default_capsule_components(),
        None,
        CapsuleRelation::Genesis,
    );
    capsule
        .agent_snapshot
        .runtime_metadata
        .budget_steps_remaining = budget_steps;
    capsule.budget.steps_remaining = budget_steps;
    capsule
        .transition(CapsuleLifecycle::Running)
        .map_err(anyhow::Error::msg)?;
    store.save_capsule(capsule.clone()).await?;
    Ok(capsule)
}

fn stores(temp: &std::path::Path) -> (DirectoryWorldProvider, LocalCapsuleStore) {
    (
        DirectoryWorldProvider::new(temp.join("worlds"), None).unwrap(),
        LocalCapsuleStore::new(temp.join("capsules.jsonl")),
    )
}

#[tokio::test]
async fn mitosis_produces_attested_clones_of_the_parent() {
    let temp = tempdir().unwrap();
    let (provider, store) = stores(temp.path());
    let parent = genesis_capsule(&provider, &store, 10).await.unwrap();

    let outcome = mitotic_fork_capsules(&provider, &store, &parent, 3)
        .await
        .unwrap();

    assert!(outcome.all_clones_verified);
    assert_eq!(outcome.daughters.len(), 3);
    assert_eq!(outcome.attestations.len(), 3);
    for daughter in &outcome.daughters {
        assert_eq!(
            daughter.budget.steps_remaining, parent.budget.steps_remaining,
            "mitotic clones inherit the full parent budget"
        );
        assert_eq!(
            daughter.agent_snapshot.genome.id, parent.agent_snapshot.genome.id,
            "clones keep the parent genome"
        );
    }
}

#[tokio::test]
async fn fission_splits_the_budget_and_strips_metadata() {
    let temp = tempdir().unwrap();
    let (provider, store) = stores(temp.path());
    let mut parent = genesis_capsule(&provider, &store, 9).await.unwrap();
    parent.agent_snapshot.branch_metadata.label = Some("parent".to_string());

    let outcome = binary_fission_capsules(&provider, &store, &parent, 3)
        .await
        .unwrap();

    assert_eq!(outcome.steps_per_daughter, 3);
    for daughter in &outcome.daughters {
        assert_eq!(daughter.budget.steps_remaining, 3);
        assert!(
            daughter.agent_snapshot.branch_metadata.label.is_none(),
            "prokaryote daughters carry no hypothesis metadata"
        );
        assert_ne!(
            daughter.live_world_id, parent.live_world_id,
            "daughters run in their own isolated worlds"
        );
    }
}

#[tokio::test]
async fn fission_refuses_a_budget_that_cannot_fund_all_daughters() {
    let temp = tempdir().unwrap();
    let (provider, store) = stores(temp.path());
    let parent = genesis_capsule(&provider, &store, 2).await.unwrap();

    let error = binary_fission_capsules(&provider, &store, &parent, 4)
        .await
        .expect_err("2 steps cannot fund 4 daughters");
    assert!(error.to_string().contains("cannot fund"));
}

#[tokio::test]
async fn budding_leaves_the_parent_intact_and_counts_scars() {
    let temp = tempdir().unwrap();
    let (provider, store) = stores(temp.path());
    let parent = genesis_capsule(&provider, &store, 50).await.unwrap();

    let first = bud_capsule(
        &provider,
        &store,
        &parent,
        &BudSpec {
            label: "lint".to_string(),
            hypothesis: "run linter on the diff".to_string(),
            bud_steps: 5,
        },
        DEFAULT_HAYFLICK_LIMIT,
    )
    .await
    .unwrap();

    assert_eq!(first.scar_count, 1);
    assert_eq!(first.bud.budget.steps_remaining, 5);
    assert_eq!(
        first.bud.agent_snapshot.branch_metadata.label.as_deref(),
        Some("bud:lint")
    );
    // Parent untouched: same budget, same state cursor.
    let reloaded = store
        .get_capsule(parent.capsule_id.0.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        reloaded.budget.steps_remaining,
        parent.budget.steps_remaining
    );

    let second = bud_capsule(
        &provider,
        &store,
        &parent,
        &BudSpec {
            label: "docs".to_string(),
            hypothesis: "summarize changes".to_string(),
            bud_steps: 2,
        },
        DEFAULT_HAYFLICK_LIMIT,
    )
    .await
    .unwrap();
    assert_eq!(second.scar_count, 2, "scars accumulate across divisions");
}

#[tokio::test]
async fn hayflick_limit_blocks_runaway_budding() {
    let temp = tempdir().unwrap();
    let (provider, store) = stores(temp.path());
    let parent = genesis_capsule(&provider, &store, 100).await.unwrap();
    let spec = BudSpec {
        label: "task".to_string(),
        hypothesis: "delegated work".to_string(),
        bud_steps: 1,
    };

    for expected in 1..=3 {
        let outcome = bud_capsule(&provider, &store, &parent, &spec, 3)
            .await
            .unwrap();
        assert_eq!(outcome.scar_count, expected);
    }
    let error = bud_capsule(&provider, &store, &parent, &spec, 3)
        .await
        .expect_err("fourth bud must be refused at limit 3");
    assert!(error.to_string().contains("Hayflick limit"));
}

#[tokio::test]
async fn schizogonic_burst_releases_every_branch_atomically() {
    let temp = tempdir().unwrap();
    let (provider, store) = stores(temp.path());
    let parent = genesis_capsule(&provider, &store, 8).await.unwrap();

    let burst = schizogonic_burst(
        &provider,
        &store,
        &parent,
        &[
            SchizogonyBranchSpec {
                label: "dfs".to_string(),
                hypothesis: "depth-first plan".to_string(),
            },
            SchizogonyBranchSpec {
                label: "bfs".to_string(),
                hypothesis: "breadth-first plan".to_string(),
            },
            SchizogonyBranchSpec {
                label: "greedy".to_string(),
                hypothesis: "greedy heuristic".to_string(),
            },
            SchizogonyBranchSpec {
                label: "random".to_string(),
                hypothesis: "stochastic rollout".to_string(),
            },
        ],
    )
    .await
    .unwrap();

    assert!(!burst.burst_id.is_empty());
    assert_eq!(burst.daughters.len(), 4);
    assert_eq!(burst.steps_per_daughter, 2);
    for daughter in &burst.daughters {
        assert_eq!(daughter.budget.steps_remaining, 2);
        assert!(daughter.verify_integrity());
    }

    // Every daughter of the burst shares the burst id through its parent link.
    for daughter in &burst.daughters {
        assert_eq!(
            daughter.parent_capsule.as_ref().map(|id| id.0.as_str()),
            Some(parent.capsule_id.0.as_str())
        );
    }
}

#[tokio::test]
async fn schizogonic_burst_rejects_duplicate_labels_before_creating_resources() {
    let temp = tempdir().unwrap();
    let (provider, store) = stores(temp.path());
    let parent = genesis_capsule(&provider, &store, 8).await.unwrap();

    let error = schizogonic_burst(
        &provider,
        &store,
        &parent,
        &[
            SchizogonyBranchSpec {
                label: "same".to_string(),
                hypothesis: "a".to_string(),
            },
            SchizogonyBranchSpec {
                label: "same".to_string(),
                hypothesis: "b".to_string(),
            },
        ],
    )
    .await
    .expect_err("duplicate labels must fail validation");

    assert!(error.to_string().contains("duplicate"));
    // Validation happens in the internal phase: no daughter was released.
    let stored = store.list_all_capsules().await.unwrap();
    assert_eq!(
        stored
            .iter()
            .filter(|c| c.relation == CapsuleRelation::Fork)
            .count(),
        0,
        "no burst daughter may exist after a failed internal phase"
    );
}

#[tokio::test]
async fn even_split_rules_are_enforced() {
    assert_eq!(even_split(10, 3).unwrap(), 3);
    assert_eq!(even_split(9, 3).unwrap(), 3);
    assert!(even_split(0, 2).is_err());
    assert!(even_split(2, 0).is_err());
}
