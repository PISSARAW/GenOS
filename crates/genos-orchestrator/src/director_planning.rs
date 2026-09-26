use crate::director::{Director, PlanForInput, Step, Strategy};
use crate::planner::{Concept, WorldState};
use std::collections::BTreeSet;

impl Director {
    pub fn plan_strategy(&self, strategy: Strategy, state: &WorldState, goal: &crate::planner::Goal) -> Vec<Step> {
        self.plan_for(PlanForInput { strategy, initial: state, goal })
    }

    pub(crate) fn plan_for(&self, input: PlanForInput<'_>) -> Vec<Step> {
        let PlanForInput { strategy, initial, goal } = input;
        let mut state = initial.clone();
        let mut steps = Vec::new();
        let mut applied = BTreeSet::new();

        let applicable: Vec<Concept> = Concept::all()
            .into_iter()
            .filter(|c| state.applicable(*c) && state.budget >= c.cost())
            .collect();

        self.apply_biome_preamble(&mut state, &mut steps, &mut applied);
        self.apply_communicate_preamble(&mut state, &mut steps, &mut applied);
        self.apply_collective_preamble(&mut CollectivePreambleInput {
            strategy,
            state: &mut state,
            steps: &mut steps,
            applied: &mut applied,
            applicable: &applicable,
        });

        let applicable_after = self.filter_applicable_after(&applicable, &state, &applied);
        let width = self.beam_width(strategy);
        steps.extend(self.beam_plan(crate::director_beam::BeamState {
            initial: &state,
            goal,
            applicable: &applicable_after,
            width,
        }));
        steps
    }

    fn apply_biome_preamble(&self, state: &mut WorldState, steps: &mut Vec<Step>, applied: &mut BTreeSet<Concept>) {
        if state.applicable(Concept::Observe) {
            let u = self.utility(Concept::Observe, state.stress);
            state.apply(Concept::Observe);
            steps.push(Step { concept: Concept::Observe, utility: u });
            applied.insert(Concept::Observe);
        }
    }

    fn apply_communicate_preamble(&self, state: &mut WorldState, steps: &mut Vec<Step>, applied: &mut BTreeSet<Concept>) {
        if state.uncertain
            && state.applicable(Concept::Communicate)
            && !state.failed.contains(&Concept::Communicate)
        {
            let u = self.utility(Concept::Communicate, state.stress);
            state.apply(Concept::Communicate);
            steps.push(Step { concept: Concept::Communicate, utility: u });
            applied.insert(Concept::Communicate);
        }
    }

    struct CollectivePreambleInput<'a> {
        strategy: Strategy,
        state: &'a mut WorldState,
        steps: &'a mut Vec<Step>,
        applied: &'a mut BTreeSet<Concept>,
        applicable: &'a [Concept],
    }

    fn apply_collective_preamble(&self, input: &mut CollectivePreambleInput<'_>) {
        if !matches!(input.strategy, Strategy::ATeam | Strategy::Biocenose) {
            return;
        }
        let mut seen = BTreeSet::new();
        for &c in input.applicable {
            if c.is_effectful()
                && seen.insert(c.tag())
                && input.state.applicable(c)
                && !input.state.failed.contains(&c)
                && !input.applied.contains(&c)
            {
                let u = self.utility(c, input.state.stress);
                input.state.apply(c);
                input.steps.push(Step { concept: c, utility: u });
                input.applied.insert(c);
            }
        }
    }

    fn filter_applicable_after(&self, applicable: &[Concept], state: &WorldState, applied: &BTreeSet<Concept>) -> Vec<Concept> {
        applicable
            .iter()
            .copied()
            .filter(|c| state.applicable(*c) && !state.failed.contains(c) && !applied.contains(c))
            .collect()
    }

    fn beam_width(&self, strategy: Strategy) -> usize {
        match strategy {
            Strategy::Solo | Strategy::Trinity => 1,
            Strategy::ATeam => 2,
            Strategy::Biocenose => 3,
            Strategy::Biome => 4,
        }
    }
}