use crate::{WorldState, planner::Goal, director::Director, metabolism::Metabolism, planner::Concept};
use crate::creativity::{DreamingPhase, SalienceGate, DopamineSignal, CrossConsolidation, RawHypothesis, FocusedTask, CreativityOutcome};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreativityConfig {
    pub enabled: bool,
    pub dream_budget_atp_per_tick: f64,
    pub max_dream_cycles: usize,
    pub atp_per_dream: f64,
    pub salience_threshold: f64,
    pub min_novelty: f64,
    pub max_focus_per_tick: usize,
}

impl Default for CreativityConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            dream_budget_atp_per_tick: 5.0,
            max_dream_cycles: 5,
            atp_per_dream: 1.0,
            salience_threshold: 0.6,
            min_novelty: 0.3,
            max_focus_per_tick: 3,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct CreativityMetrics {
    pub dreams_generated: u64,
    pub hypotheses_filtered: u64,
    pub focused_tasks_executed: u64,
    pub validated_hypotheses: u64,
    pub exploration_weight_delta: f64,
    pub novel_concepts_promoted: u64,
    pub policies_active: usize,
    pub avg_salience_score: f64,
}

#[derive(Clone, Debug)]
pub struct CreativityEngine {
    pub config: CreativityConfig,
    pub current_tick: u64,
    pub dreaming: DreamingPhase,
    pub salience: SalienceGate,
    pub dopamine: DopamineEngine,
    pub consolidation: CrossConsolidation,
}

impl Default for CreativityEngine {
    fn default() -> Self {
        Self::new(CreativityConfig::default())
    }
}

impl CreativityEngine {
    pub fn new(config: CreativityConfig) -> Self {
        let mut salience = SalienceGate::new(config.salience_threshold, config.min_novelty);
        salience.set_max_focus(config.max_focus_per_tick);

        Self {
            dreaming: DreamingPhase::new(config.clone()),
            salience,
            dopamine: DopamineSignal::new(),
            consolidation: CrossConsolidation::new(),
            pending_focused: VecDeque::new(),
            executing_tasks: Vec::new(),
            metrics: CreativityMetrics::default(),
            config,
            current_tick: 0,
        }
    }

    /// Appelé au DÉBUT de chaque tick (avant Director::decide)
    pub fn pre_tick(&mut self, world: &WorldState, goal: &Goal,
                    director: &mut Director, metabolism: &mut Metabolism) -> Vec<FocusedTask> {
        if !self.config.enabled {
            return Vec::new();
        }
        if metabolism.atp < self.config.dream_budget_atp_per_tick {
            return Vec::new();
        }

        self.current_tick += 1;

        let hypotheses = self.dreaming.dream(world, self.config.dream_budget_atp_per_tick);
        self.metrics.dreams_generated += hypotheses.len() as u64;

        let atp_consumed = (hypotheses.len() as f64 * self.config.atp_per_dream).min(metabolism.atp);
        metabolism.consume(atp_consumed);

        let focused = self.salience.evaluate(&hypotheses, world, goal);
        self.metrics.hypotheses_filtered += (hypotheses.len() - focused.len()) as u64;

        if !focused.is_empty() {
            let avg_salience: f64 = focused.iter().map(|f| f.priority).sum::<f64>() / focused.len() as f64;
            self.metrics.avg_salience_score = avg_salience;
        }

        for task in &focused {
            self.pending_focused.push_back(task.clone());
        }

        focused
    }

    /// Appelé par Director pour récupérer les tâches créatives prêtes
    pub fn pop_focused_tasks(&mut self, max: usize) -> Vec<FocusedTask> {
        let mut tasks = Vec::new();
        for _ in 0..max {
            if let Some(task) = self.pending_focused.pop_front() {
                self.executing_tasks.push(task.clone());
                tasks.push(task);
            } else {
                break;
            }
        }
        tasks
    }

    /// Appelé à la FIN de tick (après exécution concepts)
    pub fn post_tick(&mut self, director: &mut Director,
                     executed: &[(Concept, CreativityOutcome)]) {
        for (concept, outcome) in executed {
            if let Some(idx) = self.executing_tasks.iter().position(|t| t.concept == *concept) {
                let task = self.executing_tasks.remove(idx);
                if let Some(hyp) = self.dreaming.find_hypothesis(task.hypothesis_id) {
                    let expected = self.dopamine.expected_reward(&WorldState::default());
                    let actual = self.dopamine.actual_reward(outcome);
                    self.dopamine.apply(director, expected, actual);

                    self.metrics.exploration_weight_delta += director.exploration_weight - self.dopamine.baseline_exploration;

                    self.consolidation.consolidate(director, hyp, &task, outcome, self.current_tick);

                    if outcome.is_success() {
                        self.metrics.validated_hypotheses += 1;
                        self.metrics.focused_tasks_executed += 1;
                    }
                }
            }
        }

        self.metrics.policies_active = self.consolidation.policies.len();
        self.metrics.novel_concepts_promoted = self.consolidation.policies.len() as u64;
    }

    /// Vérifie si une politique émergente s'applique
    pub fn check_emergent_policy(&self, director: &Director, world: &WorldState) -> Option<crate::creativity::consolidation::EmergentPolicy> {
        self.consolidation.applicable_policy(director, world).cloned()
    }

    pub fn config(&self) -> &CreativityConfig {
        &self.config
    }

    pub fn metrics(&self) -> &CreativityMetrics {
        &self.metrics
    }

    pub fn dreaming_history(&self) -> &[RawHypothesis] {
        self.dreaming.history()
    }

    pub fn pending_count(&self) -> usize {
        self.pending_focused.len()
    }

    pub fn executing_count(&self) -> usize {
        self.executing_tasks.len()
    }

    pub fn tick(&mut self) {}

    pub fn update_config(&mut self, config: CreativityConfig) {
        self.config = config.clone();
        self.dreaming = DreamingPhase::new(config.clone());
        self.salience = SalienceGate::new(config.salience_threshold, config.min_novelty);
        self.salience.set_max_focus(config.max_focus_per_tick);
    }
}