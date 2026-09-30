use super::*;
use crate::types::{Concept, Goal, Metabolism, WorldState};

struct MockDirector {
    exploration: f64,
    stress_cost: f64,
    stats_map: std::collections::BTreeMap<Concept, crate::consolidation::ActionStats>,
}

impl DopamineTarget for MockDirector {
    fn exploration_weight(&self) -> f64 {
        self.exploration
    }

    fn set_exploration_weight(&mut self, value: f64) {
        self.exploration = value;
    }

    fn stress_cost_weight(&self) -> f64 {
        self.stress_cost
    }

    fn set_stress_cost_weight(&mut self, value: f64) {
        self.stress_cost = value;
    }
}

impl ConsolidationTarget for MockDirector {
    fn stats_mut(
        &mut self,
    ) -> &mut std::collections::BTreeMap<Concept, crate::consolidation::ActionStats> {
        &mut self.stats_map
    }

    fn record_concept(&mut self, _concept: Concept, _success: bool) {}

    fn learner_predict(&self, _concept: &Concept, _context: &[f64]) -> f64 {
        0.5
    }

    fn learner_update(&mut self, _concept: &Concept, _context: &[f64], _reward: f64) {}
}

impl DirectorAdapter for MockDirector {}

#[test]
fn test_config_defaults() {
    let config = CreativityConfig::default();
    assert!(config.enabled);
    assert_eq!(config.dream_budget_atp_per_tick, 5.0);
    assert_eq!(config.max_dream_cycles, 5);
    assert_eq!(config.atp_per_dream, 1.0);
    assert!((config.salience_threshold - 0.6).abs() < 1e-9);
    assert!((config.min_novelty - 0.3).abs() < 1e-9);
}

#[test]
fn test_engine_defaults_disabled_returns_empty() {
    let mut config = CreativityConfig::default();
    config.enabled = false;
    let mut engine = CreativityEngine::new(config);
    let mut metabolism = Metabolism::new(10.0);
    let world = WorldState::default();
    let goal = Goal::default();

    let focused = engine.pre_tick(&world, &goal, &mut metabolism);
    assert!(focused.is_empty());
}

#[test]
fn test_engine_no_budget_returns_empty() {
    let mut engine = CreativityEngine::new(CreativityConfig::default());
    let mut metabolism = Metabolism::new(0.5);
    let world = WorldState::default();
    let goal = Goal::default();

    let focused = engine.pre_tick(&world, &goal, &mut metabolism);
    assert!(focused.is_empty());
}

#[test]
fn test_post_tick_updates_metrics_on_validated() {
    let mut engine = CreativityEngine::new(CreativityConfig::default());
    let mut director = MockDirector {
        exploration: 1.5,
        stress_cost: 2.0,
        stats_map: std::collections::BTreeMap::new(),
    };
    let outcome = CreativityOutcome::Validated {
        evidence_score: 0.8,
        atp_consumed: 1.0,
    };
    let executed = vec![(Concept::Observe, outcome)];
    engine.post_tick(&mut director, &executed);
    let metrics = engine.metrics();
    assert_eq!(metrics.focused_tasks_executed, 1);
    assert_eq!(metrics.validated_hypotheses, 1);
}

#[test]
fn test_memory_roundtrip_preserves_hypotheses_and_metrics() {
    let mut engine = CreativityEngine::default();
    let mut metabolism = Metabolism::new(10.0);
    let _ = engine.pre_tick(&WorldState::default(), &Goal::Explore, &mut metabolism);
    let memory = engine.export_memory();
    let mut restored = CreativityEngine::default();
    restored.import_memory(memory.clone());

    assert_eq!(
        restored.export_memory().hypotheses.len(),
        memory.hypotheses.len()
    );
    assert_eq!(engine.metrics().dreams_generated, 1);
}
