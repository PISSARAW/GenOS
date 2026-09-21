use crate::director::Director;
use crate::planner::{ActionStats, Concept, WorldState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use crate::creativity::{CreativityOutcome, FocusedTask, RawHypothesis};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EmergentPolicy {
    pub trigger_context: HashMap<String, f64>,
    pub success_rate: f64,
    pub validations: u32,
    pub last_used_tick: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ConsolidationType {
    StatsUpdated,
    LearnerUpdated,
    PolicyPromoted,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConsolidationEvent {
    pub tick: u64,
    pub concept: Concept,
    pub event_type: ConsolidationType,
    pub details: Value,
}

/// Consolidation transversale : quand une hypothèse créative est validée,
/// on met à jour les stats du directeur, le learner, et éventuellement
/// on promeut une politique émergente.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CrossConsolidation {
    pub policies: HashMap<Concept, EmergentPolicy>,
    pub consolidation_history: Vec<ConsolidationEvent>,
    pub min_validations_for_policy: u32,
}

impl CrossConsolidation {
    pub fn new() -> Self {
        Self {
            policies: HashMap::new(),
            consolidation_history: Vec::new(),
            min_validations_for_policy: 3,
        }
    }

    /// Si hypothèse validée → met à jour Director stats + learner + politiques
    pub fn consolidate(
        &mut self,
        director: &mut Director,
        hypothesis: &RawHypothesis,
        task: &FocusedTask,
        outcome: &CreativityOutcome,
        current_tick: u64,
    ) {
        match outcome {
            CreativityOutcome::Validated { evidence_score, atp_consumed, concept } => {
                self.record_event(current_tick, *concept, ConsolidationType::StatsUpdated,
                    Value::from(serde_json::json!({ "evidence_score": evidence_score, "atp_consumed": atp_consumed })));

                if !director.stats.contains_key(concept) {
                    director.stats.insert(*concept, ActionStats::default());
                }
                let stats = director.stats.get_mut(concept).unwrap();
                stats.attempts += 1;
                stats.successes += 1;

                self.record_event(current_tick, *concept, ConsolidationType::LearnerUpdated,
                    Value::from(serde_json::json!({ "context": self.extract_context(hypothesis, task) })));

                let context = self.extract_context(hypothesis, task);
                director.learner.update(*concept, &context, *evidence_score / 100.0);

                if stats.successes >= self.min_validations_for_policy as u32 {
                    self.promote_to_policy(director, *concept, stats, current_tick);
                }
            }
            CreativityOutcome::Falsified { concept, reason } => {
                self.record_event(current_tick, *concept, ConsolidationType::StatsUpdated,
                    Value::from(serde_json::json!({ "reason": reason })));

                if !director.stats.contains_key(concept) {
                    director.stats.insert(*concept, ActionStats::default());
                }
                let stats = director.stats.get_mut(concept).unwrap();
                stats.attempts += 1;

                let context = self.extract_context(hypothesis, task);
                director.learner.update(*concept, &context, 0.0);
            }
            CreativityOutcome::NoAnswer { concept } => {
                let context = self.extract_context(hypothesis, task);
                director.learner.update(*concept, &context, 0.2);
            }
            CreativityOutcome::Error { concept, error } => {
                self.record_event(current_tick, *concept, ConsolidationType::StatsUpdated,
                    Value::from(serde_json::json!({ "error": error })));

                let context = self.extract_context(hypothesis, task);
                director.learner.update(*concept, &context, 0.0);
            }
        }
    }

    fn promote_to_policy(
        &mut self,
        director: &mut Director,
        concept: Concept,
        stats: &ActionStats,
        current_tick: u64,
    ) {
        if self.policies.contains_key(&concept) {
            return;
        }
        let policy = EmergentPolicy {
            trigger_context: self.extract_trigger_context(director),
            success_rate: stats.rate(),
            validations: stats.successes,
            last_used_tick: current_tick,
        };

        self.record_event(current_tick, concept, ConsolidationType::PolicyPromoted,
            Value::from(serde_json::json!({ "success_rate": stats.rate(), "validations": stats.successes })));

        self.policies.insert(concept, policy);

        tracing::info!("Creative policy promoted: {:?} (success_rate: {:.2}, validations: {})",
            concept, stats.rate(), stats.successes);
    }

    /// Vérifie si une politique s'applique au contexte actuel
    pub fn applicable_policy(&self, director: &Director, world: &WorldState) -> Option<&EmergentPolicy> {
        self.policies.values()
            .filter(|p| self.context_matches(&p.trigger_context, director, world))
            .max_by(|a, b| a.success_rate.partial_cmp(&b.success_rate).unwrap_or(std::cmp::Ordering::Equal))
    }

    fn context_matches(&self, trigger: &HashMap<String, f64>, director: &Director, world: &WorldState) -> bool {
        for (key, threshold) in trigger {
            let current = match key.as_str() {
                "stress" => director.stress_cost_weight,
                "budget" => world.budget_pressure,
                "threat" => world.threat,
                _ => continue,
            };
            if current < *threshold {
                return false;
            }
        }
        true
    }

    fn extract_trigger_context(&self, director: &Director) -> HashMap<String, f64> {
        let mut ctx = HashMap::new();
        ctx.insert("stress".to_string(), director.stress_cost_weight);
        ctx
    }

    fn extract_context(&self, hypothesis: &RawHypothesis, task: &FocusedTask) -> HashMap<String, f64> {
        let mut ctx = HashMap::new();
        ctx.insert("novelty_score".to_string(), hypothesis.novelty_score);
        ctx.insert("energy_cost".to_string(), hypothesis.energy_cost_estimate);
        ctx.insert("priority".to_string(), task.priority);
        ctx.insert("allocated_atp".to_string(), task.allocated_atp);
        ctx
    }

    fn record_event(&mut self, tick: u64, concept: Concept, event_type: ConsolidationType, details: Value) {
        self.consolidation_history.push(ConsolidationEvent {
            tick,
            concept,
            event_type,
            details,
        });
    }
}