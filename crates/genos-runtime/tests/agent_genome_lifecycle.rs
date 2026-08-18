use genos_core::*;
use genos_eval::{recombine_measured_trait, ReproducibilityVerdict, TraitEstimate};
use genos_runtime::*;
use genos_store::{CapsuleStore, LocalCapsuleStore};
use genos_world::{DirectoryWorldProvider, WorldProvider};
use tempfile::tempdir;

fn snapshot(name: &str) -> AgentSnapshot {
    let genome_id = GenomeId::new();
    let branch_id = BranchId::new();
    let world_id = WorldId::new();
    AgentSnapshot {
        snapshot_id: SnapshotId::new(),
        agent_id: AgentId::new(),
        branch_id: branch_id.clone(),
        branch_metadata: BranchMetadata::default(),
        genome: AgentGenome {
            id: genome_id.clone(),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            version: GenomeVersion("0.1.0".to_string()),
            identity: Identity {
                name: name.to_string(),
                role: "researcher".to_string(),
            },
            cognition: genos_core::CognitionConfig {
                chromosomes: vec![
                    genos_core::Chromosome {
                        name: "C1".to_string(),
                        loci: vec![
                            genos_core::Locus { gene_name: "exploration".to_string(), value: 0.7, epigenetic_marker: 0.0 },
                            genos_core::Locus { gene_name: "risk_tolerance".to_string(), value: 0.25, epigenetic_marker: 0.0 },
                            genos_core::Locus { gene_name: "verification_threshold".to_string(), value: 0.8, epigenetic_marker: 0.0 },
                        ],
                    }
                ],
                planning_depth: 6,
                regulators: vec![],
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: MemoryPolicy {
                working_max_items: 100,
                episodic_enabled: true,
                semantic_enabled: true,
            },
            model_policy: ModelPolicy {
                strategy: "controlled".to_string(),
                preferred_providers: vec![],
                allow_local: true,
            },
            tool_policy: ToolPolicy {
                permissions: vec![],
            },
            inferred_traits: vec![],
            breeding: None,
        },
        state: AgentState {
            genome: GenomeRef {
                genome_id,
                version: "0.1.0".to_string(),
            },
            working_memory: WorkingMemory { items: vec![] },
            semantic_memory: SemanticMemory { refs: vec![] },
            episodic_memory: EpisodicMemory { refs: vec![] },
            memories: vec![],
            tool_outputs: vec![],
            beliefs: vec![],
            active_goals: vec![],
            world_id: world_id.clone(),
            event_cursor: EventCursor {
                branch_id,
                sequence: 0,
                last_event_id: None,
            },
            execution: ExecutionMetadata {
                step: 0,
                last_model_provider: None,
            },
            artifact_refs: vec![],
        },
        world_id,
        tool_state: ToolState {
            active_tools: vec![],
        },
        runtime_metadata: RuntimeMetadata {
            runtime_version: "test".to_string(),
            budget_steps_remaining: 100,
        },
        created_at: chrono::Utc::now(),
    }
}

fn observation(genome_id: &GenomeId, environment: &str, verification: f64) -> PhenotypeObservation {
    PhenotypeObservation {
        genome_id: genome_id.clone(),
        evaluation_suite: "behavior-v1".to_string(),
        model: "model-a".to_string(),
        environment: environment.to_string(),
        measured_at: chrono::Utc::now(),
        traits: vec![ObservedTrait {
            name: "verification".to_string(),
            value: verification,
            confidence: 0.95,
            observations: 100,
            method: "paired_tasks".to_string(),
            evidence: vec![format!("eval:{environment}")],
        }],
    }
}

#[tokio::test]
async fn complete_genome_experiment_lifecycle_is_executable() -> anyhow::Result<()> {
    let mut alice = snapshot("alice");

    // ADR-0008/0012: phenotype observations become replicated claims, then an
    // explicit promotion creates a child genome rather than mutating Alice.
    let claim = infer_trait_claim(
        &[
            observation(&alice.genome.id, "dev", 0.80),
            observation(&alice.genome.id, "research", 0.82),
        ],
        "verification",
    )
    .unwrap();
    attach_inferred_trait(&mut alice.genome, claim);
    let promoted = promote_inferred_trait(
        &alice.genome,
        "verification",
        "cognition.drives.verification_threshold",
    )
    .map_err(anyhow::Error::msg)?;
    assert_ne!(promoted.id, alice.genome.id);
    assert!((promoted.cognition.get_drive("verification_threshold").unwrap() - 0.81).abs() < 1e-6);

    // ADR-0009: sibling baselines share a genome and logical state while
    // treatments produce a measurable phenotype range.
    let a1 = fork_snapshot(&alice);
    let a2 = fork_snapshot(&alice);
    let controls = CohortControls {
        model: "model-a".to_string(),
        environment: "sandbox".to_string(),
        evaluation_suite: "behavior-v1".to_string(),
        seed_policy: "paired".to_string(),
    };
    let member = |baseline: AgentSnapshot, treatment: &str, value| HeredityCohortMember {
        phenotype: observation(&baseline.genome.id, "sandbox", value),
        baseline,
        treatment: treatment.to_string(),
    };
    let cohort = analyze_fixed_genome_cohort(
        controls,
        &[member(a1, "developer", 0.72), member(a2, "scientist", 0.91)],
    )
    .map_err(anyhow::Error::msg)?;
    assert!((cohort.effects[0].range - 0.19).abs() < 1e-9);

    // ADR-0011: measured parental traits produce an untested two-parent child.
    let mut bob = snapshot("bob").genome;
    bob.cognition.set_drive("exploration", 0.3);
    let estimate = |mean| TraitEstimate {
        trait_name: "exploration".to_string(),
        mean,
        standard_error: 0.02,
        sample_size: 100,
        evaluation_suite: "traits-v1".to_string(),
    };
    let target =
        recombine_measured_trait(estimate(0.9), estimate(0.4), 0.5).map_err(anyhow::Error::msg)?;
    let charlie = breed_genomes(
        &alice.genome,
        &bob,
        "charlie",
        &[BreedingTraitMapping {
            genome_field: "cognition.drives.exploration".to_string(),
            target: target,
        }],
        &genos_core::RecombinationStrategy::HomologousRecombination,
        None,
        &[],
    )
    .map_err(anyhow::Error::msg)?;
    assert_eq!(charlie.parent_genomes.len(), 2);

    // ADR-0010: unsafe candidates are rejected before Pareto assessment.
    let metrics = |risk| CanonicalAgentMetrics {
        accuracy: 0.9,
        cost: 1.0,
        tokens: 100.0,
        latency: 10.0,
        tool_calls: 2.0,
        risk,
        hallucinations: 0.01,
        novelty: 0.7,
        success: 0.95,
    };
    let selection = artificial_select(
        &[
            SelectionCandidate {
                genome_id: charlie.id.clone(),
                metrics: metrics(0.1),
            },
            SelectionCandidate {
                genome_id: bob.id.clone(),
                metrics: metrics(0.9),
            },
        ],
        &SelectionConstraints {
            max_cost: 2.0,
            max_risk: 0.2,
            max_hallucinations: 0.05,
            min_success: 0.8,
        },
    );
    assert_eq!(selection.eligible, vec![charlie.id.clone()]);

    // ADR-0013: restored behavior is judged from paired traces and confidence bounds.
    let trace = BehaviorTrace {
        decisions: vec!["hybrid".to_string()],
        tools: vec!["inspect_db".to_string()],
        beliefs: vec!["migration=risky".to_string()],
        plan_steps: vec!["benchmark".to_string()],
        risky_actions: 0,
        total_actions: 1,
    };
    let trials = (0..10)
        .map(|_| PairedBehaviorTrial {
            source: trace.clone(),
            restored: trace.clone(),
        })
        .collect::<Vec<_>>();
    let reproduction = evaluate_paired_reproduction(
        &trials,
        &ReproducibilityThresholds {
            decision_similarity: 0.9,
            tool_selection: 0.9,
            belief_consistency: 0.95,
            planning_similarity: 0.8,
            risk_behavior: 0.95,
        },
    )
    .map_err(anyhow::Error::msg)?;
    assert_eq!(reproduction.verdict, ReproducibilityVerdict::Equivalent);

    // ADR-0014/0015: agent and world fork atomically into durable capsules;
    // pause checkpoints and destroys the live world, resume reconstructs it.
    let temp = tempdir()?;
    let provider = DirectoryWorldProvider::new(temp.path().join("worlds"), None)?;
    let store = LocalCapsuleStore::new(temp.path().join("capsules.jsonl"));
    let world_id = provider
        .create(alice.agent_id.clone(), alice.branch_id.clone())
        .await?;
    alice.world_id = world_id.clone();
    alice.state.world_id = world_id.clone();
    let world_snapshot = provider.snapshot(world_id.clone()).await?;
    let mut root = AgentWorldCapsule::new(
        alice,
        world_snapshot,
        Some(world_id),
        default_capsule_components(),
        None,
        CapsuleRelation::Genesis,
    );
    root.transition(CapsuleLifecycle::Running)
        .map_err(anyhow::Error::msg)?;
    store.save_capsule(root.clone()).await?;
    let branches = fork_counterfactual_capsules(
        &provider,
        &store,
        &root,
        &[
            CounterfactualBranchSpec {
                label: "postgres".to_string(),
                hypothesis: "keep".to_string(),
            },
            CounterfactualBranchSpec {
                label: "hybrid".to_string(),
                hypothesis: "migrate gradually".to_string(),
            },
        ],
    )
    .await?;
    assert_ne!(branches[0].live_world_id, branches[1].live_world_id);
    let paused = pause_capsule(&provider, &store, &branches[0]).await?;
    let resumed = resume_capsule(&provider, &store, &paused).await?;
    assert_eq!(resumed.lifecycle, CapsuleLifecycle::Running);
    assert!(resumed.verify_integrity());
    Ok(())
}
