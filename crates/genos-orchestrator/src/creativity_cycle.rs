use crate::creativity_adapter::{from_creative_concept, to_creative_concept, CreativityDirectorAdapter};
use crate::director::{Decision, Step};
use crate::planner::{Concept, Goal, WorldState};
use crate::tick::TickReport;
use crate::GenosEcosystem;
use genos_creativity::{CreativityOutcome, FocusedTask};
use serde_json::json;

pub(crate) struct CreativityPreparation<'a> {
    pub(crate) state: &'a WorldState,
    pub(crate) goal: &'a Goal,
    pub(crate) decision: &'a mut Decision,
}

pub(crate) struct CreativeExecution<'a> {
    pub(crate) concept: Concept,
    pub(crate) before: f64,
    pub(crate) after: f64,
    pub(crate) simulated: &'a WorldState,
    pub(crate) goal: &'a Goal,
}

impl GenosEcosystem {
    pub(crate) fn prepare_creativity(&mut self, context: CreativityPreparation<'_>) -> Vec<FocusedTask> {
        let CreativityPreparation { state, goal, decision } = context;
        let tasks = self
            .orchestrator
            .imagine(&creative_world(state, goal), &creative_goal(goal));
        if !tasks.is_empty() {
            self.record_event(
                "CREATIVE_HYPOTHESES",
                serde_json::to_value(&tasks).unwrap_or_else(|_| json!([])),
            );
        }
        if decision.halt.is_none() {
            let room = self.director.max_steps.saturating_sub(decision.steps.len());
            let creative_steps: Vec<_> = tasks
                .iter()
                .filter(|task| {
                    !decision
                        .steps
                        .iter()
                        .any(|step| step.concept == from_creative_concept(task.concept))
                })
                .take(room)
                .map(|task| Step {
                    concept: from_creative_concept(task.concept),
                    utility: task.priority,
                })
                .collect();
            decision.steps.extend(creative_steps);
        }
        tasks
    }

    pub(crate) fn consolidate_creativity(&mut self, report: &mut TickReport) {
        let executions: Vec<_> = report
            .creative_outcomes
            .iter()
            .filter_map(|(hypothesis_id, outcome)| {
                report
                    .creative_tasks
                    .iter()
                    .find(|task| task.hypothesis_id == *hypothesis_id)
                    .map(|task| (task.concept, outcome.clone()))
            })
            .collect();
        if executions.is_empty() {
            return;
        }
        let mut adapter = CreativityDirectorAdapter::new(&mut self.director);
        self.orchestrator.creativity.post_tick(&mut adapter, &executions);
        adapter.finish();
        self.record_event(
            "CREATIVE_OUTCOMES",
            serde_json::to_value(&report.creative_outcomes).unwrap_or_else(|_| json!([])),
        );
    }
}

pub(crate) fn record_creative_execution(
    report: &mut TickReport,
    execution: CreativeExecution<'_>,
) -> bool {
    let CreativeExecution { concept, before, after, simulated, goal } = execution;
    let Some(task) = report
        .creative_tasks
        .iter()
        .find(|task| from_creative_concept(task.concept) == concept)
    else {
        return false;
    };
    let outcome = if simulated.goal_reached(goal) {
        CreativityOutcome::Validated { evidence_score: 1.0, atp_consumed: concept.cost() }
    } else if after > before {
        CreativityOutcome::Validated { evidence_score: 0.5, atp_consumed: concept.cost() }
    } else {
        CreativityOutcome::Falsified
    };
    report.creative_outcomes.push((task.hypothesis_id, outcome));
    true
}

fn creative_goal(goal: &Goal) -> genos_creativity::Goal {
    match goal {
        Goal::SecurePerimeter => genos_creativity::Goal::SecurePerimeter,
        Goal::RecoverAgent => genos_creativity::Goal::RecoverAgent,
        Goal::RepairModule => genos_creativity::Goal::RepairModule,
        Goal::Explore => genos_creativity::Goal::Explore,
        Goal::Conserve => genos_creativity::Goal::Conserve,
    }
}

fn creative_world(state: &WorldState, goal: &Goal) -> genos_creativity::WorldState {
    genos_creativity::WorldState {
        budget: state.budget,
        observed: state.observed,
        tested: state.tested.iter().copied().map(to_creative_concept).collect(),
        goal: creative_goal(goal),
    }
}
