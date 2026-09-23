//! Recherche en faisceau (beam search) du directeur.
//!
//! Extrait de `director.rs` pour respecter la limite de 400 lignes par fichier.
//! Implémentation inhérente de [`crate::director::Director`] : autorisée hors
//! du module de définition car dans la même crate.

use crate::director::{BeamContext, BestUpdateContext, Director, EstimateContext, Step};
use crate::planner::{Concept, WorldState};

/// Entrées de `finished_candidate` (limite de 3 paramètres).
struct FinishedInput<'a> {
    state: &'a WorldState,
    steps: &'a [Step],
}

/// Entrées de `expand_state` (limite de 3 paramètres).
struct StateSteps<'a> {
    state: &'a WorldState,
    steps: &'a [Step],
}

/// Entrées de `expand_concept` (limite de 3 paramètres).
struct ExpandInput<'a> {
    state: &'a WorldState,
    steps: &'a [Step],
    concept: Concept,
}

impl Director {
    /// Recherche en faisceau (beam search) sur `max_steps` pas.
    pub(crate) fn beam_plan(&self, initial: &WorldState, ctx: &BeamContext<'_>) -> Vec<Step> {
        let mut beam: Vec<(WorldState, Vec<Step>, f64)> = vec![(initial.clone(), Vec::new(), 0.0)];
        let mut best: Option<(Vec<Step>, f64)> = None;

        for _ in 0..self.max_steps {
            let candidates = self.generate_candidates(&beam, ctx);
            if candidates.is_empty() {
                break;
            }
            let new_best =
                self.update_best(&candidates, &BestUpdateContext { goal: ctx.goal, current_best: best });
            beam = self.select_top_beam(candidates);
            best = self.update_best(&beam, &BestUpdateContext { goal: ctx.goal, current_best: new_best });
        }

        self.extract_best_plan(beam, best)
    }

    pub(crate) fn generate_candidates(
        &self,
        beam: &[(WorldState, Vec<Step>, f64)],
        ctx: &BeamContext<'_>,
    ) -> Vec<(WorldState, Vec<Step>, f64)> {
        let mut candidates: Vec<(WorldState, Vec<Step>, f64)> = Vec::new();
        for (state, steps, _) in beam {
            if state.goal_reached(ctx.goal) {
                candidates.push(self.finished_candidate(FinishedInput { state, steps }, ctx));
                continue;
            }
            candidates.extend(self.expand_state(StateSteps { state, steps }, ctx));
        }
        candidates
    }

    fn finished_candidate(
        &self,
        input: FinishedInput<'_>,
        ctx: &BeamContext<'_>,
    ) -> (WorldState, Vec<Step>, f64) {
        let ctx_est = EstimateContext { initial: input.state, goal: ctx.goal };
        let score = self.estimate(input.steps, &ctx_est);
        (input.state.clone(), input.steps.to_vec(), score)
    }

    fn expand_state(
        &self,
        input: StateSteps<'_>,
        ctx: &BeamContext<'_>,
    ) -> Vec<(WorldState, Vec<Step>, f64)> {
        let mut out = Vec::new();
        for &c in ctx.applicable {
            if !self.is_expandable(input.state, &c) {
                continue;
            }
            if let Some(candidate) =
                self.expand_concept(ExpandInput { state: input.state, steps: input.steps, concept: c }, ctx)
            {
                out.push(candidate);
            }
        }
        out
    }

    fn is_expandable(&self, state: &WorldState, c: &Concept) -> bool {
        !state.failed.contains(c) && state.applicable(*c) && c.is_effectful()
    }

    fn expand_concept(
        &self,
        input: ExpandInput<'_>,
        ctx: &BeamContext<'_>,
    ) -> Option<(WorldState, Vec<Step>, f64)> {
        let ExpandInput { state, steps, concept } = input;
        let before = state.progress(ctx.goal);
        let mut next_state = state.clone();
        next_state.apply(concept);
        let after = next_state.progress(ctx.goal);
        if (after - before).abs() < 1e-9 && !next_state.goal_reached(ctx.goal) {
            return None;
        }
        let mut next_steps = steps.to_vec();
        next_steps.push(Step { concept, utility: self.utility(concept, state.stress) });
        let cost: f64 = next_steps.iter().map(|s| s.concept.cost()).sum();
        let ctx_est = EstimateContext { initial: state, goal: ctx.goal };
        let score = self.estimate(&next_steps, &ctx_est) - cost * 0.001;
        Some((next_state, next_steps, score))
    }

    pub(crate) fn select_top_beam(
        &self,
        mut candidates: Vec<(WorldState, Vec<Step>, f64)>,
    ) -> Vec<(WorldState, Vec<Step>, f64)> {
        candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        candidates.truncate(4_usize.max(1));
        candidates
    }

    pub(crate) fn update_best(
        &self,
        candidates: &[(WorldState, Vec<Step>, f64)],
        ctx: &BestUpdateContext<'_>,
    ) -> Option<(Vec<Step>, f64)> {
        let mut best = ctx.current_best.clone();
        for (state, steps, score) in candidates {
            if state.goal_reached(ctx.goal) && best.as_ref().map(|(_, b)| *score > *b).unwrap_or(true) {
                best = Some((steps.clone(), *score));
            }
        }
        best
    }

    pub(crate) fn extract_best_plan(
        &self,
        beam: Vec<(WorldState, Vec<Step>, f64)>,
        best: Option<(Vec<Step>, f64)>,
    ) -> Vec<Step> {
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
    pub(crate) fn estimate(&self, steps: &[Step], ctx: &EstimateContext<'_>) -> f64 {
        let mut state = ctx.initial.clone();
        for step in steps {
            state.apply(step.concept);
        }
        let reached = if state.goal_reached(ctx.goal) { 2.0 } else { 0.0 };
        reached + state.progress(ctx.goal)
    }
}
