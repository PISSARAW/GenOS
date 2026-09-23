//! Boucle cognitive : observer → décider → agir, en un seul `tick`, et
//! `run` qui itère jusqu'à l'arrêt en produisant un rapport global.

use crate::GenosEcosystem;
use crate::clinical_therapy::{diagnose_active_virions, first_pathology_for_cell, therapy_for_pathology};
use crate::{director::Strategy, learning::context_from_state};
use crate::planner::{Concept, Goal, WorldState};
use crate::plasmids::Skill;
use crate::signaling::SignalingCascade;
use crate::trace::Verdict;
use genos_biology::neurobiology::Neurotransmitter;
use genos_biology::pathology::assess_agent_clinical_status;
use genos_biology::therapy::apply_systemic_therapy_to_cell;
use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_signal::SignalingMode;
use serde_json::json;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct TickReport {
    pub tick: u64,
    pub strategy: Strategy,
    pub organization: &'static str,
    pub superorganism: &'static str,
    pub planned: Vec<Concept>,
    pub executed: Vec<Concept>,
    pub halt: Option<String>,
    pub verdicts: Vec<(Uuid, Verdict)>,
}
/// Bilan d'une mission complète.
#[derive(Clone, Debug)]
pub struct MissionReport {
    pub ticks: usize,
    pub halted: bool,
    pub halt_reason: Option<String>,
    pub reached: bool,
    pub executed: Vec<Concept>,
    pub verdicts: usize,
    pub agents_before: usize,
    pub agents_after: usize,
    pub traces: usize,
    pub goals: Vec<String>,
}

/// Vérifications pré-délibération (extraites pour réduire la complexité).
fn pre_deliberation(eco: &mut GenosEcosystem, state: &WorldState) -> Option<TickReport> {
    eco.maintain_autopoiesis();
    diagnose_active_virions(eco);
    if state.apoptotic {
        return Some(eco.halted_report("etat apoptotique: volition inhibee"));
    }
    eco.propagate_volition(state);
    if eco.vital_reflex() {
        return Some(eco.reflex_report());
    }
    eco.express_free_desire(state);
    eco.run_instincts(state);
    None
}

impl GenosEcosystem {
pub fn tick(&mut self, goal: &Goal) -> TickReport {
        // Autopoïèse : la frontière se dégrade ; rompue, l'organisme meurt.
        self.orchestrator.membrane.update();
        if !self.orchestrator.membrane.is_alive() {
            return self.halted_report("organisme mort: membrane rompue");
        }
        if self.orchestrator.metabolism.is_starved() {
            return self.halted_report("budget epuise: atp insuffisant");
        }
        let state = self.observe();
        if let Some(report) = pre_deliberation(self, &state) {
            return report;
        }
        self.director.set_context(context_from_state(&state));
        let (decision, physical) = crate::physical_telemetry::decide(&self.director, &state, goal);
        self.director.physical_memory = Some((physical, decision.strategy));
        let mut report = TickReport {
            tick: self.events.count() as u64,
            strategy: decision.strategy,
            organization: decision.organization.name,
            superorganism: decision.superorganism.name(),
            planned: decision.steps.iter().map(|s| s.concept).collect(),
            executed: Vec::new(),
            halt: decision.halt.clone(),
            verdicts: Vec::new(),
        };
        if decision.halt.is_some() {
            let _ = self.attempt_autonomous_reproduction_if_alive();
            return report;
        }
        let mut sim = state.clone();
        for step in &decision.steps {
            // Métabolisme réel : chaque concept consomme de l'ATP.
            if !self.orchestrator.metabolism.consume(step.concept.cost()) {
                self.record_event(
                    "STARVATION",
                    json!({ "concept": format!("{:?}", step.concept) }),
                );
                break;
            }
            let before = sim.progress(goal);
            sim.apply(step.concept);
            let after = sim.progress(goal);
            self.execute_concept(step.concept, &mut report);
            self.director
                .record(step.concept, after > before || sim.goal_reached(goal));
            report.executed.push(step.concept);
        }
        // Attribution de crédit + reproduction autonome.
        let episode_reward = if sim.goal_reached(goal) { 1.0 } else { 0.0 };
        self.director.assign_credit(&report.executed, episode_reward);
        let _ = self.attempt_autonomous_reproduction_if_alive();
        report
    }
    /// Itère des ticks jusqu'à l'arrêt (ou `max_ticks`) et agrège le bilan.
    pub fn run(&mut self, goal: &Goal, max_ticks: usize) -> MissionReport {
        let agents_before = self.orchestrator.active_cells.len();
        let mut executed: Vec<Concept> = Vec::new();
        let mut verdicts = 0usize;
        let mut halt_reason = None;
        let mut halted = false;
        let mut ticks = 0usize;
        for _ in 0..max_ticks {
            let report = self.tick(goal);
            ticks += 1;
            for concept in &report.executed {
                if !executed.contains(concept) {
                    executed.push(*concept);
                }
            }
            verdicts += report.verdicts.len();
            if let Some(reason) = report.halt {
                halt_reason = Some(reason);
                halted = true;
                break;
            }
        }
        let reached = self.observe().goal_reached(goal);
        MissionReport {
            ticks,
            halted,
            halt_reason,
            reached,
            executed,
            verdicts,
            agents_before,
            agents_after: self.orchestrator.active_cells.len(),
            traces: self.events.count(),
            goals: vec![format!("{:?}", goal)],
        }
    }
}
