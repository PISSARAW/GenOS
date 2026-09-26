use crate::director::{Director, Step};
use crate::planner::{Concept, WorldState};

pub(crate) struct BeamState<'a> {
    initial: &'a WorldState,
    goal: &'a crate::planner::Goal,
    applicable: &'a [Concept],
    width: usize,
}

impl Director {
    pub(crate) fn beam_plan(&self, ctx: BeamState<'_>) -> Vec<Step> {
        self.run_beam_search(&ctx)
    }

    fn run_beam_search(&self, ctx: &BeamState<'_>) -> Vec<Step> {
        let mut beam = vec![(ctx.initial.clone(), Vec::new(), 0.0)];
        let mut best: Option<(Vec<Step>, f64)> = None;

        for _ in 0..self.max_steps {
            let candidates = self.generate_candidates(&beam, ctx);
            if candidates.is_empty() {
                break;
            }
            best = self.update_best_from_candidates(&candidates, ctx, best);
            beam = self.select_top_beam(candidates, ctx.width);
            best = self.update_best_from_beam(&beam, ctx, best);
        }

        self.extract_best_plan(beam, best)
    }

    fn generate_candidates(&self, beam: &[(WorldState, Vec<Step>, f64)], ctx: &BeamState<'_>) -> Vec<(WorldState, Vec<Step>, f64)> {
        let mut candidates = Vec::new();
        for (state, steps, _) in beam {
            if state.goal_reached(ctx.goal) {
                candidates.push(self.finished_candidate(state, steps, ctx));
                continue;
            }
            candidates.extend(self.expand_state(state, steps, ctx));
        }
        candidates
    }

    fn finished_candidate(&self, state: &WorldState, steps: &[Step], ctx: &BeamState<'_>) -> (WorldState, Vec<Step>, f64) {
        let score = self.estimate(steps, ctx.initial, ctx.goal);
        (state.clone(), steps.to_vec(), score)
    }

    fn expand_state(&self, state: &WorldState, steps: &[Step], ctx: &BeamState<'_>) -> Vec<(WorldState, Vec<Step>, f64)> {
        let mut out = Vec::new();
        for &c in ctx.applicable {
            if !self.is_expandable(state, &c) {
                continue;
            }
            if let Some(candidate) = self.expand_concept(ExpandConceptInput { state, steps, concept: c, ctx }) {
                out.push(candidate);
            }
        }
        out
    }

    fn is_expandable(&self, state: &WorldState, c: &Concept) -> bool {
        !state.failed.contains(c) && state.applicable(*c) && c.is_effectful()
    }

    fn expand_concept(&self, input: ExpandConceptInput<'_>) -> Option<(WorldState, Vec<Step>, f64)> {
        let state = input.state;
        let steps = input.steps;
        let concept = input.concept;
        let ctx = input.ctx;
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
        let score = self.estimate(&next_steps, ctx.initial, ctx.goal) - cost * 0.001;
        Some((next_state, next_steps, score))
    }
}

struct ExpandConceptInput<'a> {
    state: &'a WorldState,
    steps: &'a [Step],
    concept: Concept,
    ctx: &'a BeamState<'a>,
}

    fn update_best_from_candidates(&self, candidates: &[(WorldState, Vec<Step>, f64)], ctx: &BeamState<'_>, current_best: Option<(Vec<Step>, f64)>) -> Option<(Vec<Step>, f64)> {
        let mut best = current_best;
        for (state, steps, score) in candidates {
            if state.goal_reached(ctx.goal) && best.as_ref().map(|(_, b)| *score > *b).unwrap_or(true) {
                best = Some((steps.clone(), *score));
            }
        }
        best
    }

    fn select_top_beam(&self, mut candidates: Vec<(WorldState, Vec<Step>, f64)>, width: usize) -> Vec<(WorldState, Vec<Step>, f64)> {
        candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        candidates.truncate(width.max(1));
        candidates
    }

    fn update_best_from_beam(&self, beam: &[(WorldState, Vec<Step>, f64)], ctx: &BeamState<'_>, current_best: Option<(Vec<Step>, f64)>) -> Option<(Vec<Step>, f64)> {
        let mut best = current_best;
        for (state, steps, score) in beam {
            if state.goal_reached(ctx.goal) && best.as_ref().map(|(_, b)| *score > *b).unwrap_or(true) {
                best = Some((steps.clone(), *score));
            }
        }
        best
    }

    fn extract_best_plan(&self, beam: Vec<(WorldState, Vec<Step>, f64)>, best: Option<(Vec<Step>, f64)>) -> Vec<Step> {
        match best {
            Some((steps, _)) => steps,
            None => beam
                .into_iter()
                .max_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(_, steps, _)| steps)
                .unwrap_or_default(),
        }
    }

    pub(crate) fn estimate(&self, steps: &[Step], initial: &WorldState, goal: &crate::planner::Goal) -> f64 {
        let mut state = initial.clone();
        for step in steps {
            state.apply(step.concept);
        }
        let reached = if state.goal_reached(goal) { 2.0 } else { 0.0 };
        reached + state.progress(goal)
    }
}