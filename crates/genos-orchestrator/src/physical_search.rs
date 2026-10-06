//! Recherche bornée dont chaque expansion porte son coût physique.
use crate::director::{Director, Step, Strategy};
use crate::physical_policy::allowed_in_regime;
use crate::physics::{determine_regime, DecisionContext};
use crate::planner::{Concept, WorldState};

type Candidate = (WorldState, Vec<Step>, f64);
impl Director {
    pub(crate) fn physical_search(&self, ctx: &DecisionContext, strategy: Strategy) -> Vec<Step> {
        let width = match strategy {
            Strategy::Solo | Strategy::Trinity => 1,
            Strategy::ATeam => 2,
            Strategy::Biocenose => 3,
            Strategy::Biome => 4,
        };
        let mut beam = vec![(ctx.state.clone(), Vec::new(), ctx.state.progress(ctx.goal))];
        let mut best: Option<Candidate> = None;
        for _ in 0..self.max_steps.min(32) {
            let mut next = Vec::new();
            for candidate in &beam {
                if candidate.0.goal_reached(ctx.goal) {
                    next.push(candidate.clone());
                } else {
                    next.extend(self.physical_expand(ctx, candidate));
                }
            }
            next.sort_by(|a, b| b.2.total_cmp(&a.2));
            next.truncate(width);
            let Some(first) = next.first() else {
                break;
            };
            if best.as_ref().is_none_or(|previous| first.2 > previous.2) {
                best = Some(first.clone());
            }
            beam = next;
        }
        best.map_or_else(Vec::new, |candidate| candidate.1)
    }
    fn physical_expand(&self, ctx: &DecisionContext, candidate: &Candidate) -> Vec<Candidate> {
        Concept::all()
            .into_iter()
            .filter_map(|concept| {
                if !expandable(&candidate.0, concept) {
                    return None;
                }
                if !allowed_in_regime(concept, determine_regime(ctx.state, ctx.phys)) {
                    return None;
                }
                let mut state = candidate.0.clone();
                state.apply(concept);
                if state.progress(ctx.goal) <= candidate.0.progress(ctx.goal)
                    && !state.goal_reached(ctx.goal)
                {
                    return None;
                }
                let step = Step {
                    concept,
                    utility: self.utility(concept, candidate.0.stress),
                };
                let mut steps = candidate.1.clone();
                steps.push(Step {
                    utility: self.physical_action_utility(ctx, &step),
                    ..step
                });
                let score = self.physical_plan_score(ctx, &steps);
                Some((state, steps, score))
            })
            .collect()
    }
}
fn expandable(state: &WorldState, concept: Concept) -> bool {
    !state.failed.contains(&concept)
        && state.applicable(concept)
        && concept.is_effectful()
        && state.budget.is_finite()
        && state.budget >= concept.cost()
}
