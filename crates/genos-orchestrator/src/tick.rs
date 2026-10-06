//! Boucle cognitive : observer → décider → agir, en un seul `tick`, et
//! `run` qui itère jusqu'à l'arrêt en produisant un rapport global.

use crate::clinical_therapy::{
    diagnose_active_virions, first_pathology_for_cell, therapy_for_pathology,
};
use crate::planner::{Concept, Goal, WorldState};
use crate::plasmids::Skill;
use crate::signaling::SignalingCascade;
use crate::trace::Verdict;
use crate::GenosEcosystem;
use crate::{director::Strategy, learning::context_from_state};
use genos_biology::neurobiology::Neurotransmitter;
use genos_biology::pathology::assess_agent_clinical_status;
use genos_biology::spore::SporeType;
use genos_biology::therapy::apply_systemic_therapy_to_cell;
use genos_cell::AgentCell;
use genos_signal::SignalingMode;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Instant;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BiologicalExecutionReceipt {
    pub schema: String,
    pub receipt_id: Uuid,
    pub mission_id: Option<Uuid>,
    pub cell_id: Option<Uuid>,
    pub genome_id: Option<Uuid>,
    pub genome_fingerprint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub population_json: Option<String>,
    pub tick: u64,
    pub execution_scope: String,
    pub operation: String,
    pub metabolic_register: String,
    pub cost: f64,
    pub cost_unit: String,
    pub consumed: bool,
    pub completed: bool,
    pub observed_at_unix_ms: u128,
}

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
    pub biological_receipts: Vec<BiologicalExecutionReceipt>,
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
    crate::clinical_therapy::diagnose_active_cells(eco);
    if let Some(report) = early_survival_gate(eco, state) {
        return Some(report);
    }
    integrate_neural_signals(eco, state);
    eco.express_free_desire(state);
    eco.run_instincts(state);
    None
}

fn integrate_neural_signals(eco: &mut GenosEcosystem, state: &WorldState) {
    let threat = finite_unit(state.threat);
    let stress = finite_unit(state.stress);
    if threat == 0.0 && stress == 0.0 {
        return;
    }
    if threat > 0.0 {
        eco.neuro
            .receive("mission.threat", Neurotransmitter::Glutamate, 20.0 * threat);
    }
    if stress > 0.0 {
        eco.neuro
            .receive("mission.stress", Neurotransmitter::GABA, 8.0 * stress);
    }
    let potential_before = eco.neuro.current_potential();
    let spikes = eco.neuro.fire().unwrap_or_default();
    let potential_after = eco.neuro.current_potential();
    eco.neuro.apply_plasticity();
    eco.record_event(
        "NEURAL_MISSION_SIGNAL",
        json!({
            "schema": "genos.neural-mission-signal/v1",
            "threat": threat,
            "stress": stress,
            "potential_before": potential_before,
            "potential_after": potential_after,
            "spike_count": spikes.len(),
            "myelination": eco.neuro.myelination(),
        }),
    );
}

fn finite_unit(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

fn early_survival_gate(eco: &mut GenosEcosystem, state: &WorldState) -> Option<TickReport> {
    if state.apoptotic {
        return Some(eco.halted_report("etat apoptotique: volition inhibee"));
    }
    eco.propagate_volition(state);
    if eco.vital_reflex() {
        return Some(eco.reflex_report());
    }
    None
}

fn lifecycle_halt(eco: &mut GenosEcosystem) -> Option<TickReport> {
    eco.orchestrator.membrane.update();
    if !eco.orchestrator.membrane.is_alive() {
        return Some(eco.halted_report("organisme mort: membrane rompue"));
    }
    if eco.orchestrator.metabolism.is_starved() {
        return Some(eco.halted_report("budget epuise: atp insuffisant"));
    }
    None
}

impl GenosEcosystem {
    pub fn tick(&mut self, goal: &Goal) -> TickReport {
        if self.receipt_journal.is_none() && std::env::var_os("GENOS_BACKEND_URL").is_some() {
            return self
                .halted_report("backend receipt delivery requires GENOS_BIOLOGICAL_JOURNAL");
        }
        let mut report = self.tick_unpersisted(goal);
        if let Some(path) = &self.receipt_journal {
            let store = genos_store::BiologicalReceiptStore::open(path);
            if let Err(message) = self.persist_tick_report(&mut report, &store) {
                report.halt = Some(format!(
                    "receipt persistence/delivery failed after execution: {message}"
                ));
            }
        }
        report
    }

    pub(crate) fn tick_unpersisted(&mut self, goal: &Goal) -> TickReport {
        self.receipt_tick += 1;
        if let Some(report) = lifecycle_halt(self) {
            return report;
        }
        let state = self.observe();
        if let Some(report) = pre_deliberation(self, &state) {
            return report;
        }
        let mut state = state;
        self.regulate_mission_flux(&mut state);
        if let Err(error) = run_creative_simulation(self, &state, goal) {
            return self.halted_report(&format!("checkpoint creatif invalide: {error}"));
        }
        self.director.set_context(context_from_state(&state));
        let (decision, physical) = self.decide_with_physics(&state, goal);
        self.director.physical_memory = Some((physical, decision.strategy));
        let mut report = TickReport {
            tick: self.receipt_tick,
            strategy: decision.strategy,
            organization: decision.organization.name,
            superorganism: decision.superorganism.name(),
            planned: decision.steps.iter().map(|s| s.concept).collect(),
            executed: Vec::new(),
            halt: decision.halt.clone(),
            verdicts: Vec::new(),
            biological_receipts: Vec::new(),
        };
        if decision.halt.is_some() {
            self.attempt_physical_reproduction();
            return report;
        }
        let mut sim = state.clone();
        for step in &decision.steps {
            // Métabolisme réel : chaque concept consomme de l'ATP.
            if !self
                .orchestrator
                .metabolism
                .consume_for("tick.concept", step.concept.cost())
            {
                let mut receipt = self.execution_receipt(step.concept, false, false);
                receipt.tick = report.tick;
                self.record_biological_receipt(&receipt);
                report.biological_receipts.push(receipt);
                self.record_event(
                    "STARVATION",
                    json!({ "concept": format!("{:?}", step.concept) }),
                );
                break;
            }
            let before = sim.progress(goal);
            sim.apply(step.concept);
            let after = sim.progress(goal);
            let action_started = Instant::now();
            self.execute_concept(step.concept, &mut report);
            self.physics
                .record_action(step.concept, action_started.elapsed());
            let mut receipt = self.execution_receipt(step.concept, true, true);
            receipt.tick = report.tick;
            self.record_biological_receipt(&receipt);
            report.biological_receipts.push(receipt);
            self.director
                .record(step.concept, after > before || sim.goal_reached(goal));
            report.executed.push(step.concept);
        }
        // Attribution de crédit + reproduction autonome.
        let episode_reward = if sim.goal_reached(goal) { 1.0 } else { 0.0 };
        self.director
            .assign_credit(&report.executed, episode_reward);
        self.attempt_physical_reproduction();
        report
    }

    fn regulate_mission_flux(&mut self, state: &mut WorldState) {
        let capacity = self.orchestrator.metabolism.capacity;
        let available = self.orchestrator.metabolism.available();
        let resource_ratio = if capacity.is_finite() && capacity > 0.0 {
            (available / capacity).clamp(0.0, 1.0)
        } else {
            0.0
        };
        self.guard_cell
            .regulate(resource_ratio, finite_unit(state.stress));

        let requested_flux = if state.budget.is_finite() && state.budget > 0.0 {
            state.budget
        } else {
            0.0
        };
        let result = self.guard_cell.throttle_flux(requested_flux);
        state.budget = result.admitted_flux;
        self.record_event(
            "MISSION_FLUX_REGULATED",
            json!({
                "schema": "genos.guard-cell-mission-flux/v1",
                "resourceRatio": resource_ratio,
                "stress": finite_unit(state.stress),
                "requestedFlux": result.requested_flux,
                "admittedFlux": result.admitted_flux,
                "throttledFlux": result.throttled_flux,
                "poreApertureRatio": result.pore_aperture_ratio,
                "backpressureActive": result.backpressure_active,
                "status": result.status,
                "permission": "planning_budget_only"
            }),
        );
    }

    /// Itère des ticks jusqu'à l'arrêt (ou `max_ticks`) et agrège le bilan.
    pub fn run(&mut self, goal: &Goal, max_ticks: usize) -> MissionReport {
        self.physics.begin_episode();
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
        self.finish_physics_episode(goal, reached);
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

fn run_creative_simulation(
    eco: &mut GenosEcosystem,
    state: &WorldState,
    goal: &Goal,
) -> std::io::Result<()> {
    let Some(engine) = eco.creativity.as_mut() else {
        return Ok(());
    };
    let focused = engine.pre_tick(state, goal, &mut eco.orchestrator.metabolism)?;
    record_creative_hypotheses(eco, &focused);
    Ok(())
}

fn record_creative_hypotheses(eco: &mut GenosEcosystem, tasks: &[crate::creativity::FocusedTask]) {
    if tasks.is_empty() {
        return;
    }
    let candidates: Vec<_> = tasks
        .iter()
        .map(|task| {
            json!({
                "hypothesisId": task.hypothesis_id,
                "concept": format!("{:?}", task.concept),
                "priority": task.priority,
                "expectedEvidence": task.expected_evidence,
                "simulation": task.refined_payload
            })
        })
        .collect();
    eco.record_event("CREATIVE_SIMULATION", json!({ "candidates": candidates }));
}

#[cfg(test)]
#[path = "tick_receipt_tests.rs"]
mod receipt_tests;
