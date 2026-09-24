//! Plan morphogenetique explicable + hysteresis.
//!
//! Tout changement collectif passe par `MorphogenesisPlan` :
//! proposition -> validation -> gouvernance -> snapshot -> execution.
//! Le planner peut retourner `NO_CHANGE` et applique une hysteresis
//! (gain minimal, cooldown, budget de transition).

use crate::kernel_resolvers::ProposalSet;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

/// Changement de topologie sur un perimetre.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TopologyChange {
    pub scope: String,
    pub from: String,
    pub to: String,
}

/// Changement cognitif ou strategique.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CognitiveChange {
    pub agent: String,
    pub from: String,
    pub to: String,
}

/// Allocation de ressources.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResourceAllocation {
    pub target: String,
    pub tokens: u64,
}

/// Plan morphogenetique complet.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MorphogenesisPlan {
    pub reason: String,
    pub topology_changes: Vec<TopologyChange>,
    pub spawns: Vec<String>,
    pub preserves: Vec<String>,
    pub retires: Vec<String>,
    pub cognitive_changes: Vec<CognitiveChange>,
    pub strategy_changes: Vec<CognitiveChange>,
    pub model_assignments: Vec<CognitiveChange>,
    pub resource_allocations: Vec<ResourceAllocation>,
    pub governance_requirements: Vec<String>,
    pub rollback_topology: Option<String>,
    pub decision_no_change: bool,
    pub expected_gain: f64,
    pub transition_cost: f64,
}

impl MorphogenesisPlan {
    pub fn no_change(reason: &str, gain: f64, cost: f64) -> Self {
        Self {
            reason: reason.to_string(),
            decision_no_change: true,
            expected_gain: gain,
            transition_cost: cost,
            ..Self::default()
        }
    }

    pub fn has_meaningful_change(&self) -> bool {
        self.decision_no_change.eq(&false) && self.is_nonempty()
    }

    fn is_nonempty(&self) -> bool {
        self.topology_changes.is_empty().eq(&false)
            || self.spawns.is_empty().eq(&false)
            || self.cognitive_changes.is_empty().eq(&false)
            || self.strategy_changes.is_empty().eq(&false)
            || self.resource_allocations.is_empty().eq(&false)
    }

    pub fn is_costly_or_risky(&self) -> bool {
        self.transition_cost > 0.12 || self.governance_requirements.is_empty().eq(&false)
    }
}

/// Reglage de l'hysteresis (futur regulateur Axolotl).
#[derive(Clone, Debug)]
pub struct HysteresisPolicy {
    pub minimum_gain: f64,
    pub cooldown: Duration,
    pub transition_budget: f64,
}

impl Default for HysteresisPolicy {
    fn default() -> Self {
        Self { minimum_gain: 0.15, cooldown: Duration::from_secs(30), transition_budget: 1.0 }
    }
}

/// Etat du planner (dernier changement, budget restant).
#[derive(Debug)]
pub struct MorphogenesisPlanner {
    pub policy: HysteresisPolicy,
    pub last_change: Option<Instant>,
    pub budget_left: f64,
}

impl Default for MorphogenesisPlanner {
    fn default() -> Self {
        Self { policy: HysteresisPolicy::default(), last_change: None, budget_left: 1.0 }
    }
}

/// Entrees du planner.
pub struct PlanInput<'a> {
    pub proposals: &'a ProposalSet,
    pub current_topology: &'a str,
    pub reason: &'a str,
}

/// Totaux gain/cout (regroupe pour le gate).
#[derive(Clone, Copy, Debug)]
pub struct Totals {
    pub gain: f64,
    pub cost: f64,
}

impl MorphogenesisPlanner {
    pub fn new(policy: HysteresisPolicy) -> Self {
        Self { policy, last_change: None, budget_left: 1.0 }
    }

    /// Construit un plan a partir des propositions.
    pub fn plan(&mut self, input: &PlanInput<'_>) -> MorphogenesisPlan {
        let totals = self.sum_proposals(input.proposals);
        if self.should_hold(&totals) {
            return MorphogenesisPlan::no_change("gain insuffisant ou cooldown", totals.gain, totals.cost);
        }
        self.build_plan(input, &totals)
    }

    fn sum_proposals(&self, proposals: &ProposalSet) -> Totals {
        let mut gain = 0.0;
        let mut cost = 0.0;
        for item in proposals.items.iter() {
            gain += item.gain;
            cost += item.cost;
        }
        Totals { gain, cost }
    }

    fn should_hold(&self, totals: &Totals) -> bool {
        if totals.gain < self.policy.minimum_gain {
            return true;
        }
        if totals.cost > self.budget_left {
            return true;
        }
        self.in_cooldown()
    }

    fn in_cooldown(&self) -> bool {
        match self.last_change {
            Some(when) => when.elapsed() < self.policy.cooldown,
            None => false,
        }
    }

    fn build_plan(&mut self, input: &PlanInput<'_>, totals: &Totals) -> MorphogenesisPlan {
        let mut plan = MorphogenesisPlan {
            reason: input.reason.to_string(),
            expected_gain: totals.gain,
            transition_cost: totals.cost,
            rollback_topology: Some(input.current_topology.to_string()),
            ..MorphogenesisPlan::default()
        };
        self.fill_from_proposals(input.proposals, &mut plan);
        self.last_change = Some(Instant::now());
        self.budget_left = (self.budget_left - totals.cost).max(0.0);
        plan
    }

    fn fill_from_proposals(&self, proposals: &ProposalSet, plan: &mut MorphogenesisPlan) {
        for item in proposals.items.iter() {
            self.apply_single(item, plan);
        }
    }

    fn apply_single(&self, item: &crate::kernel_resolvers::Proposal, plan: &mut MorphogenesisPlan) {
        match item.action.as_str() {
            open if open == "change_topology" => plan.topology_changes.push(TopologyChange {
                scope: item.target.clone(),
                from: String::from("courante"),
                to: String::from("cible"),
            }),
            open if open == "spawn_verifier" => plan.spawns.push(String::from("verifier")),
            open if open == "spawn_probe" => plan.spawns.push(String::from("probe")),
            open if open == "change_recipe" => plan.cognitive_changes.push(CognitiveChange {
                agent: item.target.clone(),
                from: String::from("recette_courante"),
                to: String::from("recette_cible"),
            }),
            open if open == "change_strategy" => plan.strategy_changes.push(CognitiveChange {
                agent: item.target.clone(),
                from: String::from("strategie_courante"),
                to: String::from("strategie_cible"),
            }),
            open if open == "require_approval" => {
                plan.governance_requirements.push(String::from("approbation_humaine"))
            }
            _ => plan.preserves.push(item.target.clone()),
        }
    }
}
