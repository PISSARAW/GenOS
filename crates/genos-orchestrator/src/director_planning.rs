//! Construction de plans du directeur (préambule + beam search).
//!
//! Extrait de `director.rs` pour respecter la limite de 400 lignes par fichier.

use crate::director::{BeamContext, Director, PlanConfig, PlanRequest, PlanState, Step};
use crate::planner::{Concept, WorldState};
use std::collections::BTreeSet;

impl Director {
    /// Planifie explicitement selon une stratégie donnée (utilisé par les mondes).
    pub fn plan_strategy(&self, request: &PlanRequest) -> Vec<Step> {
        let applicable: Vec<Concept> = Concept::all()
            .into_iter()
            .filter(|c| request.state.applicable(*c) && request.state.budget >= c.cost())
            .collect();
        let config = PlanConfig {
            strategy: request.strategy,
            goal: &request.goal,
            applicable: &applicable,
        };
        self.plan_for(&request.state, &config)
    }

    /// Construit un plan pour une stratégie donnée (préambule + beam search).
    pub(crate) fn plan_for(&self, initial: &WorldState, config: &PlanConfig<'_>) -> Vec<Step> {
        let mut plan = PlanState::new(initial);
        self.apply_preamble(&mut plan, config);
        let applicable_after = self.applicable_after(&plan, config);
        let ctx = BeamContext { goal: config.goal, applicable: &applicable_after, width: 0 };
        let ctx = BeamContext { width: self.beam_width(config), ..ctx };
        plan.steps.extend(self.beam_plan(&plan.state, &ctx));
        plan.steps
    }

    fn beam_width(&self, config: &PlanConfig<'_>) -> usize {
        super_director_width(config)
    }

    fn applicable_after(&self, plan: &PlanState, config: &PlanConfig<'_>) -> Vec<Concept> {
        config
            .applicable
            .iter()
            .copied()
            .filter(|c| {
                plan.state.applicable(*c)
                    && !plan.state.failed.contains(c)
                    && !plan.applied.contains(c)
            })
            .collect::<Vec<_>>()
    }

    pub(crate) fn apply_preamble(&self, plan: &mut PlanState, config: &PlanConfig<'_>) {
        self.apply_biome_preamble(plan, config);
        self.apply_communicate_preamble(plan);
        self.apply_collective_preamble(plan, config);
    }

    fn apply_biome_preamble(&self, plan: &mut PlanState, config: &PlanConfig<'_>) {
        use crate::director::Strategy;
        if config.strategy == Strategy::Biome && plan.state.applicable(Concept::Observe) {
            let u = self.utility(Concept::Observe, plan.state.stress);
            plan.state.apply(Concept::Observe);
            plan.steps.push(Step { concept: Concept::Observe, utility: u });
            plan.applied.insert(Concept::Observe);
        }
    }

    fn apply_communicate_preamble(&self, plan: &mut PlanState) {
        if plan.state.uncertain
            && plan.state.applicable(Concept::Communicate)
            && !plan.state.failed.contains(&Concept::Communicate)
        {
            let u = self.utility(Concept::Communicate, plan.state.stress);
            plan.state.apply(Concept::Communicate);
            plan.steps.push(Step { concept: Concept::Communicate, utility: u });
            plan.applied.insert(Concept::Communicate);
        }
    }

    fn apply_collective_preamble(&self, plan: &mut PlanState, config: &PlanConfig<'_>) {
        use crate::director::Strategy;
        if !matches!(config.strategy, Strategy::ATeam | Strategy::Biocenose) {
            return;
        }
        let mut seen = BTreeSet::new();
        for &c in config.applicable {
            if c.is_effectful()
                && seen.insert(c.tag())
                && plan.state.applicable(c)
                && !plan.state.failed.contains(&c)
                && !plan.applied.contains(&c)
            {
                let u = self.utility(c, plan.state.stress);
                plan.state.apply(c);
                plan.steps.push(Step { concept: c, utility: u });
                plan.applied.insert(c);
            }
        }
    }
}

fn super_director_width(config: &PlanConfig<'_>) -> usize {
    use crate::director::Strategy;
    match config.strategy {
        Strategy::Solo | Strategy::Trinity => 1,
        Strategy::ATeam => 2,
        Strategy::Biocenose => 3,
        Strategy::Biome => 4,
    }
}
