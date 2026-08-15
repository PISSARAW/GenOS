use genos_core::{
    build_lineage_dag, AgentEvent, AgentEventType, AgentId, BranchId, CorrelationId, EventId,
    SnapshotId,
};
use genos_eval::{
    synthesize_refactor_experiment, HypothesisOutcome, ObjectiveScore, ObjectiveWeight,
    RefactorBranchEvaluation, ReusableDiscovery,
};
use genos_runtime::{
    run_long_branch, LongRunningBranchPlan, VerificationKind, VerificationPlan, WorkspaceEdit,
};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tempfile::tempdir;

fn write(path: &Path, contents: &str) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)?;
    Ok(())
}

fn fork_event(parent: &SnapshotId, child: &SnapshotId, label: &str, sequence: u64) -> AgentEvent {
    AgentEvent {
        event_id: EventId::new(),
        agent_id: AgentId::new(),
        branch_id: Some(BranchId(label.to_string())),
        sequence,
        timestamp: chrono::Utc::now(),
        event_type: AgentEventType::ForkCreated,
        payload: json!({ "parent_snapshot_id": parent.0.clone(), "fork_snapshot_id": child.0.clone(), "label": label }),
        causation_id: None,
        correlation_id: Some(CorrelationId("extreme-refactor".to_string())),
    }
}

fn pipeline() -> Vec<VerificationPlan> {
    vec![
        VerificationPlan {
            kind: VerificationKind::Tests,
            command: "cargo test --quiet".to_string(),
        },
        VerificationPlan {
            kind: VerificationKind::Benchmark,
            command: "cargo run --quiet --bin benchmark".to_string(),
        },
        VerificationPlan {
            kind: VerificationKind::Fuzzing,
            command: "cargo run --quiet --bin fuzz".to_string(),
        },
        VerificationPlan {
            kind: VerificationKind::DataMigration,
            command: "cargo run --quiet --bin migrate".to_string(),
        },
    ]
}

fn metric(objective: &str, score: f64) -> ObjectiveScore {
    ObjectiveScore {
        objective: objective.to_string(),
        score,
    }
}

fn evaluation(
    branch: &str,
    hypothesis: &str,
    scores: [f64; 4],
    outcome: HypothesisOutcome,
    reason: &str,
    finding: &str,
) -> RefactorBranchEvaluation {
    RefactorBranchEvaluation {
        branch_id: BranchId(branch.to_string()),
        hypothesis: hypothesis.to_string(),
        outcome,
        outcome_reason: reason.to_string(),
        metrics: vec![
            metric("correctness", scores[0]),
            metric("throughput", scores[1]),
            metric("migration_safety", scores[2]),
            metric("operability", scores[3]),
        ],
        discoveries: vec![ReusableDiscovery {
            branch_id: BranchId(branch.to_string()),
            finding: finding.to_string(),
            evidence: format!("tests+benchmark+fuzz+migration:{branch}"),
            reusable: true,
        }],
    }
}

#[tokio::test]
async fn recursively_forked_critical_refactor_explains_selection_and_reuses_findings(
) -> anyhow::Result<()> {
    let temp = tempdir()?;
    let seed = temp.path().join("critical-monolith");
    write(
        &seed.join("Cargo.toml"),
        "[package]\nname='critical_monolith'\nversion='0.1.0'\nedition='2021'\n",
    )?;
    write(
        &seed.join(".cargo/config.toml"),
        "[build]\ntarget-dir='../shared-refactor-target'\n",
    )?;
    write(&seed.join("src/lib.rs"), "pub fn public_total(values:&[i64])->i64{values.iter().sum()}\npub fn public_version()->&'static str{\"v1\"}\n")?;
    write(&seed.join("tests/public_contract.rs"), "use critical_monolith::*;\n#[test] fn behavior_stays_public(){assert_eq!(public_total(&[2,3,5]),10);assert_eq!(public_version(),\"v1\");}\n")?;
    write(&seed.join("src/bin/benchmark.rs"), "fn main(){let mut n=0;for _ in 0..10000{n=critical_monolith::public_total(&[n,1]);}assert_eq!(n,10000);println!(\"benchmark_ok\");}\n")?;
    write(&seed.join("src/bin/fuzz.rs"), "fn main(){for a in -100..100{for b in -10..10{assert_eq!(critical_monolith::public_total(&[a,b]),a+b);}}println!(\"fuzz_ok\");}\n")?;
    write(&seed.join("src/bin/migrate.rs"), "fn main(){let schema=include_str!(\"../../data/schema_v1.txt\");assert!(schema.contains(\"accounts\"));println!(\"migration_ok\");}\n")?;
    write(&seed.join("data/schema_v1.txt"), "accounts(id,balance)\n")?;

    let provider = DirectoryWorldProvider::new(temp.path().join("genos"), Some(seed))?;
    let root_world = provider
        .create(AgentId::new(), BranchId("S0".to_string()))
        .await?;
    let root_snapshot = provider.snapshot(root_world.clone()).await?;
    let families = [
        ("event-driven", "events as the integration boundary"),
        ("modular-monolith", "modularity before distribution"),
        ("async-workers", "move bottlenecks behind workers"),
    ];
    let leaves = [
        ("event-driven", "Kafka", "durable event log"),
        ("event-driven", "NATS", "lightweight messaging"),
        ("event-driven", "DB outbox", "transactional outbox"),
        ("modular-monolith", "vertical slices", "slice by use case"),
        (
            "modular-monolith",
            "domain modules",
            "enforce domain boundaries",
        ),
        (
            "async-workers",
            "Redis queues",
            "managed asynchronous queues",
        ),
        (
            "async-workers",
            "custom scheduler",
            "own the scheduling runtime",
        ),
    ];

    let mut lineage_events = Vec::new();
    let mut family_snapshots = HashMap::new();
    for (index, (family, hypothesis)) in families.iter().enumerate() {
        let world = provider.fork(root_snapshot.clone()).await?;
        provider
            .write_file(
                &world,
                "architecture/family.txt",
                &format!("{family}: {hypothesis}\n"),
            )
            .await?;
        let snapshot = provider.snapshot(world).await?;
        lineage_events.push(fork_event(
            &root_snapshot,
            &snapshot,
            family,
            index as u64 + 1,
        ));
        family_snapshots.insert(*family, snapshot);
    }

    let mut outcomes = Vec::new();
    let mut leaf_snapshots = HashMap::new();
    for (index, (family, label, hypothesis)) in leaves.iter().enumerate() {
        let parent_snapshot = family_snapshots
            .get(family)
            .expect("family snapshot missing");
        let outcome = run_long_branch(
            &provider,
            &root_world,
            parent_snapshot,
            LongRunningBranchPlan {
                branch_id: BranchId((*label).to_string()),
                label: (*label).to_string(),
                hypothesis: (*hypothesis).to_string(),
                edits: vec![WorkspaceEdit {
                    relative_path: "architecture/strategy.txt".to_string(),
                    contents: format!("strategy={label}\nhypothesis={hypothesis}\n"),
                }],
                verifications: pipeline(),
            },
        )
        .await?;
        let leaf_snapshot = provider.snapshot(outcome.world_id.clone()).await?;
        lineage_events.push(fork_event(
            parent_snapshot,
            &leaf_snapshot,
            label,
            index as u64 + 10,
        ));
        leaf_snapshots.insert(*label, leaf_snapshot);
        outcomes.push(outcome);
    }

    assert_eq!(outcomes.len(), 7);
    assert!(outcomes
        .iter()
        .all(|outcome| outcome.verifications.len() == 4));
    assert!(outcomes
        .iter()
        .flat_map(|outcome| &outcome.verifications)
        .all(|stage| stage.passed));
    assert!(outcomes.iter().all(|outcome| outcome.files_changed >= 2));

    let dag = build_lineage_dag(&lineage_events);
    assert_eq!(dag.edges.len(), 10);
    assert_eq!(
        dag.nearest_common_ancestor(&leaf_snapshots["Kafka"], &leaf_snapshots["NATS"]),
        Some(family_snapshots["event-driven"].clone()),
    );

    let evaluations = vec![
        evaluation(
            "Kafka",
            "durable event log",
            [0.90, 0.95, 0.55, 0.55],
            HypothesisOutcome::Rejected,
            "dual-write migration risk and operational load were too high",
            "schema governance is mandatory for shared events",
        ),
        evaluation(
            "NATS",
            "lightweight messaging",
            [0.88, 0.90, 0.65, 0.75],
            HypothesisOutcome::Supported,
            "good latency but weaker replay guarantees",
            "backpressure limits must be explicit",
        ),
        evaluation(
            "DB outbox",
            "transactional outbox",
            [0.98, 0.75, 0.95, 0.90],
            HypothesisOutcome::Supported,
            "best behavioral and migration safety",
            "outbox relays need idempotent consumers",
        ),
        evaluation(
            "vertical slices",
            "slice by use case",
            [0.95, 0.70, 0.90, 0.85],
            HypothesisOutcome::Supported,
            "safe incremental modularisation",
            "public contracts map cleanly to slice boundaries",
        ),
        evaluation(
            "domain modules",
            "enforce domain boundaries",
            [0.96, 0.68, 0.92, 0.80],
            HypothesisOutcome::Supported,
            "strong boundaries with moderate migration cost",
            "dependency rules expose hidden coupling",
        ),
        evaluation(
            "Redis queues",
            "managed asynchronous queues",
            [0.92, 0.88, 0.70, 0.75],
            HypothesisOutcome::Rejected,
            "ordering semantics broke critical workflows",
            "idempotency keys generalise to every worker backend",
        ),
        evaluation(
            "custom scheduler",
            "own the scheduling runtime",
            [0.85, 0.82, 0.50, 0.40],
            HypothesisOutcome::Rejected,
            "operational complexity dominated throughput gains",
            "lease expiry is required for crash recovery",
        ),
    ];
    let synthesis = synthesize_refactor_experiment(
        &evaluations,
        &[
            ObjectiveWeight {
                objective: "correctness".to_string(),
                weight: 0.40,
            },
            ObjectiveWeight {
                objective: "throughput".to_string(),
                weight: 0.25,
            },
            ObjectiveWeight {
                objective: "migration_safety".to_string(),
                weight: 0.20,
            },
            ObjectiveWeight {
                objective: "operability".to_string(),
                weight: 0.15,
            },
        ],
    )
    .expect("experiment must select a branch");

    assert_eq!(synthesis.selected_branch, BranchId("DB outbox".to_string()));
    assert_eq!(synthesis.rejected_hypotheses.len(), 3);
    assert_eq!(synthesis.reused_discoveries.len(), 7);
    println!("lineage=S0→3 families→7 strategies");
    for outcome in &outcomes {
        println!(
            "{} pipeline=4/4 diff={} files",
            outcome.label, outcome.files_changed
        );
    }
    println!("{}", synthesis.explanation);
    for failure in &synthesis.rejected_hypotheses {
        println!("rejected: {failure}");
    }
    for discovery in &synthesis.reused_discoveries {
        println!("reuse {}: {}", discovery.branch_id, discovery.finding);
    }
    Ok(())
}
