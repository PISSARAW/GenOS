use std::collections::BTreeSet;

use super::types::{Decision, Step, Strategy, COSTLY_CONCEPT_THRESHOLD};
use crate::learning::Learner;
use crate::planner::{ActionStats, Concept, Goal, WorldState};

impl Director {
    /// Planifie explicitement selon une stratégie donnée (utilisé par les mondes).
    pub fn plan_strategy(
        &self,
        strategy: Strategy,
        state: &WorldState,
        goal: &Goal,
    ) -> Vec<Step> {
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
        let mut applied_concepts: BTreeSet<Concept> = BTreeSet::new();

        // Préambule propre à la stratégie.
        if strategy == Strategy::Biome && state.applicable(Concept::Observe) {
            let u = self.utility(Concept::Observe, state.stress);
            state.apply(Concept::Observe);
            steps.push(Step {
                concept: Concept::Observe,
                utility: u,
            });
            applied_concepts.insert(Concept::Observe);
        }
        if state.uncertain
            && state.applicable(Concept::Communicate)
            && !state.failed.contains(&Concept::Communicate)
        {
            let u = self.utility(Concept::Communicate, state.stress);
            state.apply(Concept::Communicate);
            steps.push(Step {
                concept: Concept::Communicate,
                utility: u,
            });
            applied_concepts.insert(Concept::Communicate);
        }
        if matches!(strategy, Strategy::ATeam | Strategy::Biocenose) {
            let mut seen: BTreeSet<&str> = BTreeSet::new();
            for &c in applicable {
                if c.is_effectful()
                    && seen.insert(c.tag())
                    && state.applicable(c)
                    && !state.failed.contains(&c)
                    && !applied_concepts.contains(&c)
                {
                    let u = self.utility(c, state.stress);
                    state.apply(c);
                    steps.push(Step {
                        concept: c,
                        utility: u,
                    });
                    applied_concepts.insert(c);
                }
            }
        }

        // Mettre à jour la liste des concepts applicables après le préambule.
        // Exclure explicitement les concepts déjà appliqués dans le préambule.
        let applicable_after_preamble: Vec<Concept> = applicable
            .iter()
            .copied()
            .filter(|c| {
                state.applicable(*c) && !state.failed.contains(c) && !applied_concepts.contains(c)
            })
            .collect();

        // Recherche plus profonde : faisceau de largeur dépendant de la stratégie.
        let width = match strategy {
            Strategy::Solo | Strategy::Trinity => 1,
            Strategy::ATeam => 2,
            Strategy::Biocenose => 3,
            Strategy::Biome => 4,
        };
        steps.extend(self.beam_plan(&state, goal, &applicable_after_preamble, width));
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
        let mut beam: Vec<(WorldState, Vec<Step>, f64)> =
            vec![(initial.clone(), Vec::new(), 0.0)];
        let mut best: Option<(Vec<Step>, f64)> = None;
        for _ in 0..self.max_steps {
            let mut candidates: Vec<(WorldState, Vec<Step>, f64)> = Vec::new();
            for (state, steps, _) in &beam {
                if state.goal_reached(goal) {
                    let score = self.estimate(steps, initial, goal);
                    if best
                        .as_ref()
                        .map(|(_, b)| score > *b)
                        .unwrap_or(true)
                    {
                        best = Some((steps.clone(), score));
                    }
                    continue;
                }
                for &c in applicable {
                    if state.failed.contains(&c)
                        || !state.applicable(c)
                        || !c.is_effectful()
                    {
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
                b.2
                    .partial_cmp(&a.2)
                    .unwrap_or(std::cmp::Ordering::Equal)
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
                .max_by(|a, b| {
                    a.2
                        .partial_cmp(&b.2)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|(_, steps, _)| steps)
                .unwrap_or_default(),
        }
    }

    /// Estime la qualité d'un plan en le rejouant sur une copie de l'état.
    pub(crate) fn estimate(&self, steps: &[Step], initial: &WorldState, goal: &Goal) -> f64 {
        let mut state = initial.clone();
        for step in steps {
            state.apply(step.concept);
        }
        let reached = if state.goal_reached(goal) { 2.0 } else { 0.0 };
        reached + state.progress(goal)
    }
}