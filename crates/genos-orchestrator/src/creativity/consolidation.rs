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

pub struct ConsolidationInput<'a> {
    pub director: &'a mut Director,
    pub hypothesis: &'a RawHypothesis,
    pub task: &'a FocusedTask,
    pub outcome: &'a CreativityOutcome,
    pub current_tick: u64,
}

pub struct PolicyContext<'a> {
    pub director: &'a Director,
    pub world: &'a WorldState,
}

struct PolicyPromotionInput<'a> {
    director: &'a mut Director,
    concept: Concept,
    stats: &'a ActionStats,
    current_tick: u64,
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
    pub fn consolidate(&mut self, input: ConsolidationInput<'_>) {
        let ConsolidationInput { director, hypothesis, task, outcome, current_tick } = input;
        match outcome {
            CreativityOutcome::Validated { evidence_score, atp_consumed, concept } => {
                self.record_event(ConsolidationEvent {
                    tick: current_tick,
                    concept: *concept,
                    event_type: ConsolidationType::StatsUpdated,
                    details: serde_json::json!({ "evidence_score": evidence_score, "atp_consumed": atp_consumed }),
                });

                if !director.stats.contains_key(concept) {
                    director.stats.insert(*concept, ActionStats::default());
                }
                let promoted_stats = {
                    let stats = director.stats.get_mut(concept).unwrap();
                    stats.attempts += 1;
                    stats.successes += 1;
                    stats.clone()
                };

                self.record_event(ConsolidationEvent {
                    tick: current_tick,
                    concept: *concept,
                    event_type: ConsolidationType::LearnerUpdated,
                    details: serde_json::json!({ "context": self.extract_context(hypothesis, task) }),
                });

                let context = self.extract_context(hypothesis, task);
                director.learner.update(*concept, &context_features(&context), *evidence_score / 100.0);

                if promoted_stats.successes >= self.min_validations_for_policy {
                    self.promote_to_policy(PolicyPromotionInput {
                        director,
                        concept: *concept,
                        stats: &promoted_stats,
                        current_tick,
                    });
                }
            }
            CreativityOutcome::Falsified { concept, reason } => {
                self.record_event(ConsolidationEvent {
                    tick: current_tick,
                    concept: *concept,
                    event_type: ConsolidationType::StatsUpdated,
                    details: serde_json::json!({ "reason": reason }),
                });

                if !director.stats.contains_key(concept) {
                    director.stats.insert(*concept, ActionStats::default());
                }
                let stats = director.stats.get_mut(concept).unwrap();
                stats.attempts += 1;

                let context = self.extract_context(hypothesis, task);
                director.learner.update(*concept, &context_features(&context), 0.0);
            }
            CreativityOutcome::NoAnswer { concept } => {
                let context = self.extract_context(hypothesis, task);
                director.learner.update(*concept, &context_features(&context), 0.2);
            }
            CreativityOutcome::Error { concept, error } => {
                self.record_event(ConsolidationEvent {
                    tick: current_tick,
                    concept: *concept,
                    event_type: ConsolidationType::StatsUpdated,
                    details: serde_json::json!({ "error": error }),
                });

                let context = self.extract_context(hypothesis, task);
                director.learner.update(*concept, &context_features(&context), 0.0);
            }
        }
    }

    fn promote_to_policy(&mut self, input: PolicyPromotionInput<'_>) {
        let PolicyPromotionInput { director, concept, stats, current_tick } = input;
        if self.policies.contains_key(&concept) {
            return;
        }
        let policy = EmergentPolicy {
            trigger_context: self.extract_trigger_context(director),
            success_rate: stats.rate(),
            validations: stats.successes,
            last_used_tick: current_tick,
        };

        self.record_event(ConsolidationEvent {
            tick: current_tick,
            concept,
            event_type: ConsolidationType::PolicyPromoted,
            details: serde_json::json!({ "success_rate": stats.rate(), "validations": stats.successes }),
        });

        self.policies.insert(concept, policy);

    }

    /// Vérifie si une politique s'applique au contexte actuel
    pub fn applicable_policy(&self, context: PolicyContext<'_>) -> Option<&EmergentPolicy> {
        self.policies.values()
            .filter(|p| Self::context_matches(&p.trigger_context, &context))
            .max_by(|a, b| a.success_rate.partial_cmp(&b.success_rate).unwrap_or(std::cmp::Ordering::Equal))
    }

    fn context_matches(trigger: &HashMap<String, f64>, context: &PolicyContext<'_>) -> bool {
        for (key, threshold) in trigger {
            let current = match key.as_str() {
                "stress" => context.director.stress_cost_weight,
                "budget" => context.world.budget_pressure,
                "threat" => context.world.threat,
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

    fn record_event(&mut self, event: ConsolidationEvent) {
        self.consolidation_history.push(event);
    }
}

fn context_features(context: &HashMap<String, f64>) -> Vec<f64> {
    ["novelty_score", "energy_cost", "priority", "allocated_atp"]
        .map(|key| context.get(key).copied().unwrap_or_default())
        .to_vec()
}
