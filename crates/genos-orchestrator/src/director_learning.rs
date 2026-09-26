use crate::director::{Director, COSTLY_CONCEPT_THRESHOLD, PLASTICITY_RATE, STRESS_CONTEXT_INDEX};
use crate::planner::{Concept, WorldState};

impl Director {
    pub fn record(&mut self, concept: Concept, success: bool) {
        let entry = self.stats.entry(concept).or_default();
        entry.attempts += 1;
        if success {
            entry.successes += 1;
        }
        if !self.last_context.is_empty() {
            let context = self.last_context.clone();
            self.learner.update(concept, &context, if success { 1.0 } else { 0.0 });
        }
        self.adapt_regulation(concept, success);
    }

    fn adapt_regulation(&mut self, concept: Concept, success: bool) {
        let stress = self
            .last_context
            .get(STRESS_CONTEXT_INDEX)
            .copied()
            .unwrap_or(0.0);
        if stress > 0.3 && concept.cost() >= COSTLY_CONCEPT_THRESHOLD {
            let direction = if success { -1.0 } else { 1.0 };
            self.stress_cost_weight =
                (self.stress_cost_weight + PLASTICITY_RATE * direction * stress).clamp(0.0, 4.0);
        }
    }

    pub fn assign_credit(&mut self, plan: &[Concept], reward: f64) {
        if self.last_context.is_empty() {
            return;
        }
        let context = self.last_context.clone();
        self.learner.assign_credit(plan, &context, reward);
    }

    pub fn note_failure(&mut self, concept: Concept, state: &mut WorldState) {
        self.record(concept, false);
        state.failed.insert(concept);
    }
}