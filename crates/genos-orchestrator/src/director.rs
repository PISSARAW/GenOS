use crate::learning::Learner;
use crate::organization::{
    Organization, Superorganism, by_name, select_organization, select_superorganism,
};
use crate::planner::{ActionStats, Concept, Goal, WorldState};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// Stratégies d'équipe, façon organisation biologique.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Strategy {
    Solo,
    ATeam,
    Biocenose,
    Biome,
    Trinity,
}

#[derive(Clone, Debug)]
pub struct Step {
    pub concept: Concept,
    pub utility: f64,
}
#[derive(Clone, Debug)]
pub struct Decision {
    pub strategy: Strategy,
    /// Organisation (topologie de communication) retenue par le directeur.
    pub organization: Organization,
    /// Forme d'organisation biologique retenue (holobionte, syncytium, ...).
    pub superorganism: Superorganism,
    pub steps: Vec<Step>,
    pub rationale: String,
    pub halt: Option<String>,
}
/// Index du niveau de stress dans le vecteur de contexte (`context_from_state`).
pub(crate) const STRESS_CONTEXT_INDEX: usize = 3;
/// Vitesse d'adaptation des paramètres organisationnels (plasticité).
pub(crate) const PLASTICITY_RATE: f64 = 0.02;
/// Coût à partir duquel un concept est considéré « coûteux » pour la plasticité.
pub(crate) const COSTLY_CONCEPT_THRESHOLD: f64 = 4.0;

/// Le directeur : politique de décision, avec mémoire d'expérience.
#[derive(Clone, Debug)]
pub struct Director {
    pub stats: BTreeMap<Concept, ActionStats>,
    pub max_steps: usize,
    /// Apprentissage contextuel par concept (bandits linéaires).
    pub learner: Learner,
    /// Dernier contexte observé (features du `WorldState`).
    pub last_context: Vec<f64>,
    /// Paramètres adaptatifs du contrôleur, optimisables par la population.
    pub exploration_weight: f64,
    pub stress_cost_weight: f64,
    pub physical_memory: Option<(crate::physics::PhysicalState, Strategy)>,
}

impl Default for Director {
    fn default() -> Self {
        Self {
            stats: BTreeMap::new(),
            max_steps: 12,
            learner: Learner::new(),
            last_context: Vec::new(),
            exploration_weight: 1.5,
            stress_cost_weight: 2.0,
            physical_memory: None,
        }
    }
}

/// Expérience apprise du directeur, sérialisable.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DirectorState {
    pub stats: BTreeMap<Concept, ActionStats>,
    pub learner: Learner,
    pub exploration_weight: f64,
    pub stress_cost_weight: f64,
}

impl Director {
    pub fn new() -> Self {
        Self::default()
    }

    /// Exporte l'expérience apprise (stats, bandits contextuels, paramètres
    /// organisationnels de plasticité) pour la persister sur disque.
    pub fn export_state(&self) -> DirectorState {
        DirectorState {
            stats: self.stats.clone(),
            learner: self.learner.clone(),
            exploration_weight: self.exploration_weight,
            stress_cost_weight: self.stress_cost_weight,
        }
    }

    /// Recharge une expérience préalablement exportée.
    pub fn import_state(&mut self, state: DirectorState) {
        self.stats = state.stats;
        self.learner = state.learner;
        self.exploration_weight = state.exploration_weight;
        self.stress_cost_weight = state.stress_cost_weight;
    }

    /// Applique les gènes du candidat.
    pub fn set_policy_genes(&mut self, genes: &[f64]) {
        if let Some(value) = genes.first() {
            self.exploration_weight = value.clamp(0.1, 3.0);
        }
        if let Some(value) = genes.get(1) {
            self.stress_cost_weight = value.clamp(0.0, 4.0);
        }
    }

    pub(crate) fn utility(&self, c: Concept, stress: f64) -> f64 {
        let predicted = self.predicted_reward(c);
        let explore = self.exploration_bonus(c);
        predicted + explore - self.stress_cost_penalty(c, stress)
    }

    fn predicted_reward(&self, c: Concept) -> f64 {
        if self.last_context.is_empty() {
            self.stats.get(&c).map(ActionStats::rate).unwrap_or(0.5)
        } else {
            self.learner.predict(c, &self.last_context)
        }
    }

    fn exploration_bonus(&self, c: Concept) -> f64 {
        let updates = self.learner.updates(c);
        if updates == 0 {
            self.exploration_weight
        } else {
            1.0 / (1.0 + updates as f64).sqrt()
        }
    }

    fn stress_cost_penalty(&self, c: Concept, stress: f64) -> f64 {
        c.cost() * 0.01 * (1.0 + self.stress_cost_weight * stress.clamp(0.0, 1.0))
    }

    /// Fixe le contexte courant (appelé par la boucle avant de décider).
    pub fn set_context(&mut self, context: Vec<f64>) {
        self.last_context = context;
    }

    pub(crate) fn halt(strategy: Strategy, reason: &str) -> Decision {
        Decision {
            strategy,
            organization: *by_name("network_silence").expect("organisation du catalogue"),
            superorganism: Superorganism::Swarm,
            steps: Vec::new(),
            rationale: reason.to_string(),
            halt: Some(reason.to_string()),
        }
    }

    pub fn decide(&self, state: &WorldState, goal: &Goal) -> Decision {
        if let Some(halt) = self.check_halt_conditions(state, goal) {
            return halt;
        }
        let applicable = self.applicable_concepts(state);
        if let Some(halt) = self.check_applicable_concepts(state, &applicable) {
            return halt;
        }
        let scored = self.score_strategies(state, goal);
        if scored.is_empty() {
            return Self::halt(Strategy::Solo, "aucun progres possible : moyens inutiles au but");
        }
        scored.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        if scored[0].2 <= state.progress(goal) + 1e-9 {
            return Self::halt(Strategy::Solo, "aucun progres possible : moyens inutiles au but");
        }
        let (strategy, steps) = self.select_best_strategy(&scored);
        self.build_decision(BuildDecisionInput { strategy, steps, state, goal })
    }

    fn check_halt_conditions(&self, state: &WorldState, goal: &Goal) -> Option<Decision> {
        if state.goal_reached(goal) {
            return Some(Self::halt(Strategy::Solo, "objectif atteint"));
        }
        if state.budget <= 0.0 {
            return Some(Self::halt(Strategy::Solo, "budget epuise"));
        }
        if state.unsolvable {
            return Some(Self::halt(Strategy::Solo, "probleme declare insoluble"));
        }
        None
    }

    fn applicable_concepts(&self, state: &WorldState) -> Vec<Concept> {
        Concept::all()
            .into_iter()
            .filter(|c| state.applicable(*c) && state.budget >= c.cost())
            .collect()
    }

    fn check_applicable_concepts(&self, state: &WorldState, applicable: &[Concept]) -> Option<Decision> {
        if applicable.is_empty() {
            let famine = Concept::all().into_iter().any(|c| state.applicable(c));
            return Some(Self::halt(
                Strategy::Solo,
                if famine {
                    "budget insuffisant : famine"
                } else {
                    "arsenal epuise : aucun moyen applicable"
                },
            ));
        }
        if applicable.iter().all(|c| !c.is_effectful()) {
            return Some(Self::halt(
                Strategy::Solo,
                "moyens restants sans effet : probleme insoluble dans l'etat actuel",
            ));
        }
        None
    }

    fn score_strategies(&self, state: &WorldState, goal: &Goal) -> Vec<(Strategy, Vec<Step>, f64)> {
        let bases = [
            Strategy::Solo,
            Strategy::ATeam,
            Strategy::Biocenose,
            Strategy::Biome,
        ];
        bases
            .iter()
            .map(|s| {
                let steps = self.plan_for(PlanForInput {
                    strategy: *s,
                    initial: state,
                    goal,
                });
                let score = self.estimate(&steps, state, goal);
                (*s, steps, score)
            })
            .filter(|(_, steps, _)| !steps.is_empty())
            .collect()
    }

    fn select_best_strategy(&self, scored: &[(Strategy, Vec<Step>, f64)]) -> (Strategy, Vec<Step>) {
        if scored.len() >= 2 && (scored[0].2 - scored[1].2).abs() < 0.1 {
            let mut merged = scored[0].1.clone();
            for step in &scored[1].1 {
                if !merged.iter().any(|s| s.concept == step.concept) {
                    merged.push(step.clone());
                }
            }
            (Strategy::Trinity, merged)
        } else {
            (scored[0].0, scored[0].1.clone())
        }
    }

    fn build_decision(&self, input: BuildDecisionInput<'_>) -> Decision {
        let DecisionInput { organization, superorganism, rationale } = self.prepare_decision(input);
        Decision {
            strategy: input.strategy,
            organization,
            superorganism,
            steps: input.steps,
            rationale,
            halt: None,
        }
}

struct BuildDecisionInput<'a> {
    strategy: Strategy,
    steps: Vec<Step>,
    state: &'a WorldState,
    goal: &'a Goal,
}

struct PrepareDecisionInput<'a> {
    strategy: Strategy,
    steps: &'a [Step],
    state: &'a WorldState,
    goal: &'a Goal,
}

struct DecisionInput {
    organization: Organization,
    superorganism: Superorganism,
    rationale: String,
}

#[derive(Clone)]
pub struct PlanForInput<'a> {
    pub strategy: Strategy,
    pub initial: &'a WorldState,
    pub goal: &'a Goal,
}