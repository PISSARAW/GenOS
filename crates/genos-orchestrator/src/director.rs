use crate::learning::Learner;
use crate::organization::{Organization, Superorganism, by_name, select_organization, select_superorganism};
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
    /// Organisation (topologie de communication) retenue par le directeur.
    pub organization: Organization,
    /// Forme d'organisation biologique retenue (holobionte, syncytium, ...).
    pub superorganism: Superorganism,
    pub steps: Vec<Step>,
    pub rationale: String,
    pub halt: Option<String>,
}

/// Le directeur : politique de décision, avec mémoire d'expérience.
#[derive(Clone, Debug)]
pub struct Director {
    pub stats: BTreeMap<Concept, ActionStats>,
    pub max_steps: usize,
    /// Apprentissage contextuel par concept (bandits linéaires).
    pub learner: Learner,
    /// Dernier contexte observé (features du `WorldState`).
    pub last_context: Vec<f64>,
}

impl Default for Director {
    fn default() -> Self {
        Self {
            stats: BTreeMap::new(),
            max_steps: 12,
            learner: Learner::new(),
            last_context: Vec::new(),
        }
    }
}

impl Director {
    pub fn new() -> Self {
        Self::default()
    }

    fn utility(&self, c: Concept, stress: f64) -> f64 {
        // Récompense attendue apprise (contextuelle) ; repli sur le taux global.
        let predicted = if self.last_context.is_empty() {
            self.stats.get(&c).map(ActionStats::rate).unwrap_or(0.5)
        } else {
            self.learner.predict(c, &self.last_context)
        };
        let updates = self.learner.updates(c);
        let explore = if updates == 0 {
            1.5
        } else {
            1.0 / (1.0 + updates as f64).sqrt()
        };
        // Sous stress, le coût pèse davantage (économie d'énergie).
        predicted + explore - c.cost() * 0.01 * (1.0 + 2.0 * stress.clamp(0.0, 1.0))
    }

    /// Fixe le contexte courant (appelé par la boucle avant de décider).
    pub fn set_context(&mut self, context: Vec<f64>) {
        self.last_context = context;
    }

    fn halt(strategy: Strategy, reason: &str) -> Decision {
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

        // Aucun plan ne fait progresser l'état -> arrêt (moyens inutiles au but).
        if scored[0].2 <= state.progress(goal) + 1e-9 {
            return Self::halt(Strategy::Solo, "aucun progres possible : moyens inutiles au but");
        }

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
            organization: *select_organization(state, goal),
            superorganism: select_superorganism(state, goal),
            steps,
            rationale,
            halt: None,
        }
    }

    /// Planifie explicitement selon une stratégie donnée (utilisé par les mondes).
    pub fn plan_strategy(&self, strategy: Strategy, state: &WorldState, goal: &Goal) -> Vec<Step> {
        let applicable: Vec<Concept> = Concept::all()
            .into_iter()
            .filter(|c| state.applicable(*c) && state.budget >= c.cost())
            .collect();
        self.plan_for(strategy, state, goal, &applicable)
    }

    /// Construit un plan pour une stratégie donnée (préambule + beam search).
    fn plan_for(
        &self,
        strategy: Strategy,
        initial: &WorldState,
        goal: &Goal,
        applicable: &[Concept],
    ) -> Vec<Step> {
        let mut state = initial.clone();
        let mut steps = Vec::new();

        // Préambule propre à la stratégie.
        if strategy == Strategy::Biome && state.applicable(Concept::Observe) {
            let u = self.utility(Concept::Observe, state.stress);
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
                    let u = self.utility(c, state.stress);
                    state.apply(c);
                    steps.push(Step { concept: c, utility: u });
                }
            }
        }

        // Recherche plus profonde : faisceau de largeur dépendant de la stratégie.
        let width = match strategy {
            Strategy::Solo | Strategy::Trinity => 1,
            Strategy::ATeam => 2,
            Strategy::Biocenose => 3,
            Strategy::Biome => 4,
        };
        steps.extend(self.beam_plan(&state, goal, applicable, width));
        steps
    }

    /// Recherche en faisceau (beam search) sur `max_steps` pas.
    fn beam_plan(
        &self,
        initial: &WorldState,
        goal: &Goal,
        applicable: &[Concept],
        width: usize,
    ) -> Vec<Step> {
        let mut beam: Vec<(WorldState, Vec<Step>, f64)> = vec![(initial.clone(), Vec::new(), 0.0)];
        let mut best: Option<(Vec<Step>, f64)> = None;
        for _ in 0..self.max_steps {
            let mut candidates: Vec<(WorldState, Vec<Step>, f64)> = Vec::new();
            for (state, steps, _) in &beam {
                if state.goal_reached(goal) {
                    let score = self.estimate(steps, initial, goal);
                    if best.as_ref().map(|(_, b)| score > *b).unwrap_or(true) {
                        best = Some((steps.clone(), score));
                    }
                    continue;
                }
                for &c in applicable {
                    if state.failed.contains(&c) || !state.applicable(c) || !c.is_effectful() {
                        continue;
                    }
                    let before = state.progress(goal);
                    let mut next_state = state.clone();
                    next_state.apply(c);
                    let after = next_state.progress(goal);
                    if (after - before).abs() < 1e-9 && !next_state.goal_reached(goal) {
                        continue;
                    }
                    let mut next_steps = steps.clone();
                    next_steps.push(Step {
                        concept: c,
                        utility: self.utility(c, state.stress),
                    });
                    let cost: f64 = next_steps.iter().map(|s| s.concept.cost()).sum();
                    let score = self.estimate(&next_steps, initial, goal) - cost * 0.001;
                    candidates.push((next_state, next_steps, score));
                }
            }
            if candidates.is_empty() {
                break;
            }
            candidates.sort_by(|a, b| {
                b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal)
            });
            candidates.truncate(width.max(1));
            beam = candidates;
            for (state, steps, score) in &beam {
                if state.goal_reached(goal)
                    && best.as_ref().map(|(_, b)| *score > *b).unwrap_or(true)
                {
                    best = Some((steps.clone(), *score));
                }
            }
        }
        match best {
            Some((steps, _)) => steps,
            None => beam
                .into_iter()
                .max_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(_, steps, _)| steps)
                .unwrap_or_default(),
        }
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
        if !self.last_context.is_empty() {
            let context = self.last_context.clone();
            self.learner
                .update(concept, &context, if success { 1.0 } else { 0.0 });
        }
    }

    /// Assignation de crédit : propage la récompense d'épisode au plan exécuté.
    pub fn assign_credit(&mut self, plan: &[Concept], reward: f64) {
        if self.last_context.is_empty() {
            return;
        }
        let context = self.last_context.clone();
        self.learner.assign_credit(plan, &context, reward);
    }

    /// Change de décision : marque un concept comme défaillant pour l'exclure.
    pub fn note_failure(&mut self, concept: Concept, state: &mut WorldState) {
        self.record(concept, false);
        state.failed.insert(concept);
    }
}
