use crate::planner::{ActionStats, Concept, Goal, WorldState};
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
    pub steps: Vec<Step>,
    pub rationale: String,
    pub halt: Option<String>,
}

/// Le directeur : politique de décision, avec mémoire d'expérience.
#[derive(Clone, Debug)]
pub struct Director {
    pub stats: BTreeMap<Concept, ActionStats>,
    pub max_steps: usize,
}

impl Default for Director {
    fn default() -> Self {
        Self {
            stats: BTreeMap::new(),
            max_steps: 12,
        }
    }
}

impl Director {
    pub fn new() -> Self {
        Self::default()
    }

    fn utility(&self, c: Concept) -> f64 {
        let stats = self.stats.get(&c);
        let rate = stats.map(ActionStats::rate).unwrap_or(0.5);
        let explore = if stats.map(ActionStats::is_untested).unwrap_or(true) {
            1.5
        } else {
            0.0
        };
        rate + explore - c.cost() * 0.01
    }

    fn halt(strategy: Strategy, reason: &str) -> Decision {
        Decision {
            strategy,
            steps: Vec::new(),
            rationale: reason.to_string(),
            halt: Some(reason.to_string()),
        }
    }

    pub fn decide(&self, state: &WorldState, goal: &Goal) -> Decision {
        if state.goal_reached(goal) {
            return Self::halt(Strategy::Solo, "objectif atteint");
        }
        if state.budget <= 0.0 {
            return Self::halt(Strategy::Solo, "budget epuise");
        }
        if state.unsolvable {
            return Self::halt(Strategy::Solo, "probleme declare insoluble");
        }
        let applicable: Vec<Concept> = Concept::all()
            .into_iter()
            .filter(|c| state.applicable(*c) && state.budget >= c.cost())
            .collect();
        if applicable.is_empty() {
            return Self::halt(Strategy::Solo, "arsenal epuise : aucun moyen applicable");
        }
        if applicable.iter().all(|c| !c.is_effectful()) {
            return Self::halt(
                Strategy::Solo,
                "moyens restants sans effet : probleme insoluble dans l'etat actuel",
            );
        }

        let bases = [Strategy::Solo, Strategy::ATeam, Strategy::Biocenose, Strategy::Biome];
        let mut scored: Vec<(Strategy, Vec<Step>, f64)> = bases
            .iter()
            .map(|s| {
                let steps = self.plan_for(*s, state, goal, &applicable);
                let score = self.estimate(&steps, state, goal);
                (*s, steps, score)
            })
            .collect();
        scored.retain(|(_, steps, _)| !steps.is_empty());
        if scored.is_empty() {
            return Self::halt(Strategy::Solo, "aucun progres possible : moyens inutiles au but");
        }
        scored.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

        let (strategy, steps) = if scored.len() >= 2 && (scored[0].2 - scored[1].2).abs() < 0.1 {
            // Deux stratégies se valent : on les explore en parallèle (Trinity).
            let mut merged = scored[0].1.clone();
            for step in &scored[1].1 {
                if !merged.iter().any(|s| s.concept == step.concept) {
                    merged.push(step.clone());
                }
            }
            (Strategy::Trinity, merged)
        } else {
            (scored[0].0, scored[0].1.clone())
        };
        let rationale = format!(
            "strategie {:?} retenue ({} etapes, cout {:.1})",
            strategy,
            steps.len(),
            steps.iter().map(|s| s.concept.cost()).sum::<f64>()
        );
        Decision {
            strategy,
            steps,
            rationale,
            halt: None,
        }
    }

    /// Construit un plan pour une stratégie donnée, en simulant l'état.
    fn plan_for(
        &self,
        strategy: Strategy,
        initial: &WorldState,
        goal: &Goal,
        applicable: &[Concept],
    ) -> Vec<Step> {
        let mut state = initial.clone();
        let mut steps = Vec::new();
        let mut exhausted: BTreeSet<Concept> = BTreeSet::new();

        // Préambule propre à la stratégie.
        if strategy == Strategy::Biome && state.applicable(Concept::Observe) {
            let u = self.utility(Concept::Observe);
            state.apply(Concept::Observe);
            steps.push(Step { concept: Concept::Observe, utility: u });
        }
        if matches!(strategy, Strategy::ATeam | Strategy::Biocenose) {
            let mut seen: BTreeSet<&'static str> = BTreeSet::new();
            for &c in applicable {
                if c.is_effectful()
                    && seen.insert(c.tag())
                    && state.applicable(c)
                    && !state.failed.contains(&c)
                {
                    let u = self.utility(c);
                    state.apply(c);
                    steps.push(Step { concept: c, utility: u });
                }
            }
        }

        for _ in 0..self.max_steps {
            if state.goal_reached(goal) || state.budget <= 0.0 {
                break;
            }
            let mut best: Option<(Concept, f64)> = None;
            for &c in applicable {
                if exhausted.contains(&c)
                    || state.failed.contains(&c)
                    || !state.applicable(c)
                    || !c.is_effectful()
                {
                    continue;
                }
                let u = self.utility(c);
                if best.map(|(_, bu)| u > bu).unwrap_or(true) {
                    best = Some((c, u));
                }
            }
            let Some((c, u)) = best else { break };
            let before = state.progress(goal);
            state.apply(c);
            let after = state.progress(goal);
            steps.push(Step { concept: c, utility: u });
            if (after - before).abs() < 1e-9 && !state.goal_reached(goal) {
                exhausted.insert(c);
            }
        }
        steps
    }

    /// Estime la qualité d'un plan en le rejouant sur une copie de l'état.
    fn estimate(&self, steps: &[Step], initial: &WorldState, goal: &Goal) -> f64 {
        let mut state = initial.clone();
        for step in steps {
            state.apply(step.concept);
        }
        let reached = if state.goal_reached(goal) { 2.0 } else { 0.0 };
        reached + state.progress(goal)
    }

    /// Apprentissage : enregistre l'issue réelle d'un concept.
    pub fn record(&mut self, concept: Concept, success: bool) {
        let entry = self.stats.entry(concept).or_default();
        entry.attempts += 1;
        if success {
            entry.successes += 1;
        }
    }

    /// Change de décision : marque un concept comme défaillant pour l'exclure.
    pub fn note_failure(&mut self, concept: Concept, state: &mut WorldState) {
        self.record(concept, false);
        state.failed.insert(concept);
    }
}
