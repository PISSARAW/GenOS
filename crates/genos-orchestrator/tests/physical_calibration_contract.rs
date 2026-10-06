use genos_orchestrator::director::Director;
use genos_orchestrator::physical_learning::{EpisodeObservation, MissionPhysicsProfile};
use genos_orchestrator::physical_measurements::*;
use genos_orchestrator::physical_runtime::PhysicalRuntime;
use genos_orchestrator::physical_store::PhysicalProfileStore;
use genos_orchestrator::planner::{Concept, Goal, WorldState};
use tempfile::TempDir;

fn episode() -> EpisodeObservation {
    EpisodeObservation {
        success: true,
        consumed_atp: 80.0,
        elapsed_ms: 400.0,
        context_bytes: Some(40_000),
        dependency_edges: Some(200),
        actions: vec![(Concept::Observe, 1.0, 4.0)],
    }
}
fn learned() -> MissionPhysicsProfile {
    let mut profile = MissionPhysicsProfile::default();
    for _ in 0..3 {
        profile.observe(&episode());
    }
    profile
}
#[test]
fn constants_need_real_samples_and_are_bounded() {
    let mut profile = MissionPhysicsProfile::default();
    profile.record_episode(true);
    assert_eq!(profile.budget_reference(), 120.0);
    for _ in 0..3 {
        profile.observe(&episode());
    }
    assert_eq!(profile.budget_reference(), 80.0);
    assert_eq!(profile.context_reference(), 40_000.0);
    assert_eq!(profile.dependency_reference(), 200.0);
    assert_eq!(profile.actions[&Concept::Observe].latency_ms.mean, 4.0);
    let mut costly = episode();
    costly.consumed_atp = 1_000_000.0;
    for _ in 0..3 {
        profile.observe(&costly);
    }
    assert!(profile.budget_reference() <= 240.0);
}
#[test]
fn no_action_does_not_train_costs() {
    let mut profile = MissionPhysicsProfile::default();
    let mut noop = episode();
    noop.consumed_atp = 0.0;
    profile.observe(&noop);
    assert_eq!(profile.episodes, 0);
    assert_eq!(profile.consumed_atp.count, 0);
}
#[test]
fn profiles_are_restored_and_isolated_by_goal() {
    let root = TempDir::new().unwrap();
    let config = WorkspacePhysicsConfig::for_root(root.path());
    let mut store = PhysicalProfileStore::open(&config).unwrap();
    store.save("explore", &learned()).unwrap();
    drop(store);
    let mut runtime = PhysicalRuntime::default();
    runtime.config = config;
    let mut director = Director::default();
    runtime.decide(&mut director, (&WorldState::default(), &Goal::Explore));
    assert_eq!(director.mission_physics["explore"].consumed_atp.count, 3);
    assert!(!director.mission_physics.contains_key("conserve"));
    assert_eq!(runtime.last_report.unwrap().calibrated_samples, 3);
}
#[test]
fn invalid_profile_is_rejected_and_old_snapshot_is_compatible() {
    let root = TempDir::new().unwrap();
    let mut store =
        PhysicalProfileStore::open(&WorkspacePhysicsConfig::for_root(root.path())).unwrap();
    let mut invalid = learned();
    invalid.successes = invalid.episodes + 1;
    assert!(store.save("explore", &invalid).is_err());
    assert!(store.save("../escape", &learned()).is_err());
    let old: MissionPhysicsProfile =
        serde_json::from_str(r#"{"episodes":3,"successes":2,"friction_scale":1.0}"#).unwrap();
    assert!(old.valid());
    assert_eq!(old.budget_reference(), 120.0);
}
#[test]
fn full_decision_payload_or_explicit_context_is_measured() {
    let root = TempDir::new().unwrap();
    let mut runtime = PhysicalRuntime::default();
    runtime.config = WorkspacePhysicsConfig::for_root(root.path());
    let mut director = Director::default();
    runtime.decide(&mut director, (&WorldState::default(), &Goal::Explore));
    let context = &runtime.last_report.as_ref().unwrap().telemetry.context;
    assert!(context.value.as_ref().unwrap().bytes > 100);
    assert!(context.source.contains("world"));
    runtime
        .set_context_usage(
            ContextUsage {
                bytes: 1234,
                tokens: Some(90),
                capacity_tokens: Some(100),
            },
            "provider usage receipt",
        )
        .unwrap();
    runtime
        .set_evidence_debt(
            EvidenceDebt {
                outstanding: 3,
                required: 4,
            },
            "evidence obligations",
        )
        .unwrap();
    runtime.decide(&mut director, (&WorldState::default(), &Goal::Explore));
    let receipt = runtime.last_report.as_ref().unwrap();
    assert_eq!(receipt.telemetry.context_bytes, Some(1234));
    assert!(receipt.state.pressure >= 0.9);
    assert_eq!(receipt.state.evidence_debt, 0.75);
    runtime.decide(&mut director, (&WorldState::default(), &Goal::Explore));
    assert_ne!(
        runtime.last_report.unwrap().telemetry.context_bytes,
        Some(1234)
    );
}
#[test]
fn broken_persistence_is_visible() {
    let root = TempDir::new().unwrap();
    std::fs::write(root.path().join(".genos"), "not a directory").unwrap();
    let mut runtime = PhysicalRuntime::default();
    runtime.config = WorkspacePhysicsConfig::for_root(root.path());
    runtime.decide(
        &mut Director::default(),
        (&WorldState::default(), &Goal::Explore),
    );
    assert!(runtime
        .diagnostics
        .iter()
        .any(|error| error.contains("persistance indisponible")));
}
#[test]
fn corrupt_snapshot_is_reported_without_losing_valid_profile() {
    let root = TempDir::new().unwrap();
    let config = WorkspacePhysicsConfig::for_root(root.path());
    let mut store = PhysicalProfileStore::open(&config).unwrap();
    store.save("explore", &learned()).unwrap();
    std::fs::write(
        root.path().join(".genos/physical-profiles/broken.json"),
        "{",
    )
    .unwrap();
    let mut reloaded = PhysicalProfileStore::open(&config).unwrap();
    assert_eq!(reloaded.load()["explore"].episodes, 3);
    assert!(!reloaded.diagnostics.is_empty());
}

#[test]
fn invalid_moments_and_overflow_cannot_poison_learned_references() {
    let mut profile = learned();
    profile.consumed_atp.observe(f64::MAX);
    assert!(profile.valid());
    profile.context_bytes.count = profile.episodes + 1;
    assert!(!profile.valid());
}
