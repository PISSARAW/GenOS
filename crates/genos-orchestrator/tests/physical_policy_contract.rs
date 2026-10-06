use genos_orchestrator::director::{Director, Strategy};
use genos_orchestrator::physical_measurements::WorkspacePhysicsConfig;
use genos_orchestrator::physical_policy::allowed_in_regime;
use genos_orchestrator::physics::*;
use genos_orchestrator::planner::{Concept, Goal, WorldState};
use genos_orchestrator::GenosEcosystem;
use tempfile::TempDir;

#[test]
fn expansion_is_rejected_in_restricted_regimes() {
    for regime in [
        Regime::Conservation,
        Regime::Contention,
        Regime::Consolidation,
        Regime::HumanReview,
    ] {
        assert!(!allowed_in_regime(Concept::Recruit, regime));
        assert!(!allowed_in_regime(Concept::Mutate, regime));
    }
    assert!(allowed_in_regime(Concept::Observe, Regime::Conservation));
    assert!(allowed_in_regime(Concept::Therapy, Regime::Contention));
}
#[test]
fn physical_costs_affect_executable_plan_utilities() {
    let director = Director::default();
    let state = WorldState {
        uncertain: true,
        workers: 1,
        required_workers: 1,
        ..Default::default()
    };
    let calm = PhysicalState::default();
    let harsh = PhysicalState {
        friction: 1.0,
        temperature: 1.0,
        viscosity: 1.0,
        ..calm.clone()
    };
    let goal = Goal::Explore;
    let context = DecisionContext {
        state: &state,
        goal: &goal,
        phys: &calm,
        previous_strategy: None,
    };
    let first = director.decide_physical(&context);
    let second = director.decide_physical(&DecisionContext {
        phys: &harsh,
        ..context
    });
    assert!(!first.steps.is_empty());
    assert!(!second.steps.is_empty());
    assert!(
        second.steps.iter().map(|step| step.utility).sum::<f64>()
            < first.steps.iter().map(|step| step.utility).sum::<f64>()
    );
}
#[test]
fn every_new_cost_dimension_changes_utility() {
    let profile = action_profile(Concept::Actuate);
    let base = PhysicalState {
        energy: 0.5,
        ..Default::default()
    };
    let score = utility_score(&UtilityInputs {
        expected_gain: 2.0,
        profile: &profile,
        phys: &base,
    });
    let variants = [
        PhysicalState {
            temperature: 1.0,
            ..base.clone()
        },
        PhysicalState {
            viscosity: 1.0,
            ..base.clone()
        },
        PhysicalState {
            elasticity: 0.0,
            ..base.clone()
        },
        PhysicalState {
            evidence_debt: 1.0,
            ..base.clone()
        },
        PhysicalState {
            resonance: 1.0,
            ..base.clone()
        },
        PhysicalState {
            energy: 0.0,
            ..base.clone()
        },
    ];
    for state in variants {
        assert!(
            utility_score(&UtilityInputs {
                expected_gain: 2.0,
                profile: &profile,
                phys: &state
            }) < score
        );
    }
    let mut gravity = base.clone();
    gravity.record_gravity("src/core.rs", 1.0);
    assert!(
        utility_score(&UtilityInputs {
            expected_gain: 2.0,
            profile: &profile,
            phys: &gravity
        }) < score
    );
}
#[test]
fn plasticity_and_resonance_change_pivot_threshold() {
    let base = PhysicalState::default();
    assert!(
        inertia_threshold(
            &PhysicalState {
                plasticity: 1.0,
                ..base.clone()
            },
            0.5
        ) < inertia_threshold(&base, 0.5)
    );
    assert!(
        inertia_threshold(
            &PhysicalState {
                resonance: 1.0,
                ..base.clone()
            },
            0.5
        ) > inertia_threshold(&base, 0.5)
    );
}
#[test]
fn nonfinite_budget_and_cost_inputs_do_not_escape_control() {
    let director = Director::default();
    let state = WorldState {
        budget: f64::NAN,
        ..Default::default()
    };
    let physical = PhysicalState::derive(&state, None);
    assert_eq!(physical.energy, 0.0);
    let context = DecisionContext {
        state: &state,
        goal: &Goal::Explore,
        phys: &physical,
        previous_strategy: Some(Strategy::Solo),
    };
    assert!(director.decide_physical(&context).halt.is_some());
    let mut profile = action_profile(Concept::Actuate);
    profile.friction = f64::NAN;
    assert!(utility_score(&UtilityInputs {
        expected_gain: 1.0,
        profile: &profile,
        phys: &physical
    })
    .is_finite());
}
#[test]
fn tick_emits_measured_decision_and_zero_run_does_not_train() {
    let root = TempDir::new().unwrap();
    let mut ecosystem = GenosEcosystem::new("physical-contract");
    ecosystem.physics.config = WorkspacePhysicsConfig::for_root(root.path());
    let report = ecosystem.run(&Goal::Explore, 0);
    assert_eq!(report.ticks, 0);
    assert!(ecosystem.director.mission_physics.is_empty());
    ecosystem.tick(&Goal::Explore);
    let receipt = ecosystem
        .physics
        .last_report
        .as_ref()
        .expect("physical decision receipt");
    assert_eq!(receipt.schema, "genos.physical-decision/v2");
    assert!(receipt.telemetry.context_bytes.unwrap() > 100);
    assert!(ecosystem
        .read_events(0)
        .iter()
        .any(|event| event.event_type == "PHYSICAL_DECISION"));
}
#[test]
fn run_calibrates_consumed_actions_and_persists_automatically() {
    let root = TempDir::new().unwrap();
    let mut ecosystem = GenosEcosystem::new("physical-learning-contract");
    ecosystem.physics.config = WorkspacePhysicsConfig::for_root(root.path());
    let report = ecosystem.run(&Goal::Explore, 1);
    assert!(
        !report.executed.is_empty(),
        "fixture must execute a real concept"
    );
    let profile = &ecosystem.director.mission_physics["explore"];
    assert_eq!(profile.consumed_atp.count, 1);
    assert!(profile.consumed_atp.mean > 0.0);
    assert_eq!(profile.successes, u64::from(report.reached));
    let saved = profile.episodes;
    let mut reloaded = GenosEcosystem::new("physical-restart-contract");
    reloaded.physics.config = WorkspacePhysicsConfig::for_root(root.path());
    reloaded.tick(&Goal::Explore);
    assert_eq!(reloaded.director.mission_physics["explore"].episodes, saved);
}
