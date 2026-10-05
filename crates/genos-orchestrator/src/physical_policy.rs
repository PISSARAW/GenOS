//! Les coûts physiques participent au classement et au contrôle des plans.
use crate::director::{Decision, Director, Step, Strategy};
use crate::organization::{select_organization, select_superorganism};
use crate::physics::*;
use crate::planner::Concept;

impl Director {
    pub fn decide_physical(&self, ctx: &DecisionContext) -> Decision {
        if !ctx.state.budget.is_finite() {
            return Self::halt(Strategy::Solo, "budget non fini");
        }
        if ctx.state.goal_reached(ctx.goal) || ctx.state.unsolvable || ctx.state.budget <= 0.0 {
            return self.decide(ctx.state, ctx.goal);
        }
        match determine_regime(ctx.state, ctx.phys) {
            Regime::HumanReview => {
                return Self::halt(
                    Strategy::Solo,
                    "risque de rupture eleve : revue humaine requise",
                )
            }
            Regime::Consolidation => {
                return Self::halt(
                    Strategy::Solo,
                    "entropie trop haute : consolidation obligatoire avant expansion",
                )
            }
            _ => {}
        }
        let mut candidates: Vec<_> = [
            Strategy::Solo,
            Strategy::ATeam,
            Strategy::Biocenose,
            Strategy::Biome,
        ]
        .into_iter()
        .filter_map(|strategy| self.physical_candidate(ctx, strategy))
        .collect();
        candidates.sort_by(|a, b| b.2.total_cmp(&a.2));
        let Some((strategy, steps, _)) = candidates.into_iter().next() else {
            return Self::halt(
                Strategy::Solo,
                "aucun plan compatible avec les contraintes physiques",
            );
        };
        let decision = Decision {
            strategy,
            steps,
            organization: *select_organization(ctx.state, ctx.goal),
            superorganism: select_superorganism(ctx.state, ctx.goal),
            rationale: format!("strategie {strategy:?} retenue apres couts physiques"),
            halt: None,
        };
        self.physical_inertia_gate(ctx, decision)
    }
    fn physical_candidate(
        &self,
        ctx: &DecisionContext,
        strategy: Strategy,
    ) -> Option<(Strategy, Vec<Step>, f64)> {
        let plan = self.plan_strategy(strategy, ctx.state, ctx.goal);
        let mut simulated = ctx.state.clone();
        let mut steps = Vec::new();
        for step in plan {
            if !allowed_in_regime(step.concept, determine_regime(ctx.state, ctx.phys)) {
                continue;
            }
            if !simulated.applicable(step.concept) || simulated.budget < step.concept.cost() {
                continue;
            }
            let utility = self.physical_action_utility(ctx, &step);
            simulated.apply(step.concept);
            steps.push(Step { utility, ..step });
        }
        let searched = self.physical_search(ctx, strategy);
        if self.physical_plan_score(ctx, &searched) > self.physical_plan_score(ctx, &steps) {
            steps = searched;
        }
        if steps.is_empty()
            || self.estimate(&steps, ctx.state, ctx.goal) <= ctx.state.progress(ctx.goal) + 1e-9
        {
            return None;
        }
        let score = self.physical_plan_score(ctx, &steps);
        Some((strategy, steps, score))
    }
    pub(crate) fn physical_action_utility(&self, ctx: &DecisionContext, step: &Step) -> f64 {
        let mut profile = action_profile(step.concept);
        if let Some(learned) = self
            .mission_physics
            .get(&ctx.goal.mission_key())
            .filter(|profile| profile.valid())
        {
            if let Some(action) = learned.actions.get(&step.concept) {
                if action.latency_ms.count >= 3 {
                    profile.latency =
                        (action.latency_ms.mean / learned.latency_reference()).clamp(0.0, 1.0);
                }
                if action.atp.count >= 3 {
                    profile.mass = (action.atp.mean / learned.budget_reference()).clamp(0.0, 1.0);
                }
            }
        }
        utility_score(&UtilityInputs {
            expected_gain: step.utility,
            profile: &profile,
            phys: ctx.phys,
        })
    }
    pub(crate) fn physical_plan_score(&self, ctx: &DecisionContext, steps: &[Step]) -> f64 {
        self.estimate(steps, ctx.state, ctx.goal)
            + steps.iter().map(|step| step.utility).sum::<f64>() * 0.05
            - steps.iter().map(|step| step.concept.cost()).sum::<f64>() * 0.001
    }
    fn physical_inertia_gate(&self, ctx: &DecisionContext, decision: Decision) -> Decision {
        let Some(previous) = ctx
            .previous_strategy
            .filter(|previous| *previous != decision.strategy)
        else {
            return decision;
        };
        let Some((_, steps, score)) = self.physical_candidate(ctx, previous) else {
            return decision;
        };
        let current_score = self.physical_plan_score(ctx, &decision.steps);
        let success = self
            .stats
            .values()
            .map(|stats| stats.rate())
            .fold(0.0_f64, f64::max);
        if current_score - score > inertia_threshold(ctx.phys, success) {
            return decision;
        }
        Decision {
            strategy: previous,
            steps,
            rationale: format!(
                "{}; inertie: strategie precedente conservee",
                decision.rationale
            ),
            ..decision
        }
    }
}
pub fn allowed_in_regime(concept: Concept, regime: Regime) -> bool {
    let expands = matches!(
        concept,
        Concept::Recruit
            | Concept::Organize
            | Concept::Mutate
            | Concept::Cross
            | Concept::Endosymbiosis
            | Concept::Genomics
    );
    match regime {
        Regime::HumanReview | Regime::Consolidation => false,
        Regime::Conservation | Regime::Contention => !expands,
        Regime::Normal => true,
    }
}
