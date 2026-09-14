//! Boucle cognitive : observer → décider → agir, en un seul `tick`, et
//! `run` qui itère jusqu'à l'arrêt en produisant un rapport global.

use crate::GenosEcosystem;
use crate::director::Strategy;
use crate::planner::{Concept, Goal};
use crate::plasmids::Skill;
use crate::signaling::SignalingCascade;
use crate::trace::Verdict;
use genos_biology::neurobiology::Neurotransmitter;
use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_signal::SignalingMode;
use serde_json::json;
use uuid::Uuid;

/// Bilan d'un tick.
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

/// Bilan d'une mission complète (`run`).
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
}

impl GenosEcosystem {
    /// Un cycle complet : observer, décider, exécuter, apprendre.
    pub fn tick(&mut self, goal: &Goal) -> TickReport {
        let state = self.observe();
        let decision = self.director.decide(&state, goal);
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
            return report;
        }

        let mut sim = state.clone();
        for step in &decision.steps {
            let before = sim.progress(goal);
            sim.apply(step.concept);
            let after = sim.progress(goal);
            self.execute_concept(step.concept, &mut report);
            self.director
                .record(step.concept, after > before || sim.goal_reached(goal));
            report.executed.push(step.concept);
        }
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
            traces: self.traces.known(),
        }
    }

    fn arena_workers(&self) -> Vec<Uuid> {
        self.orchestrator
            .tissues
            .get("Arena")
            .map(|tissue| tissue.somatic_cells.clone())
            .unwrap_or_default()
    }

    fn first_dna_agent(&self) -> Option<Uuid> {
        self.agent_dna.keys().copied().next()
    }

    fn execute_concept(&mut self, concept: Concept, report: &mut TickReport) {
        match concept {
            Concept::Observe => {
                self.record_event("OBSERVE", json!({}));
                let _ = self.senses.electrolocate(&[1.0, 1.0, 1.0]);
            }
            Concept::Organize => {
                if !self.orchestrator.tissues.contains_key("Arena") {
                    let _ = self.orchestrator.create_tissue("Arena", "Mission");
                }
            }
            Concept::Recruit => {
                if self.orchestrator.tissues.contains_key("Arena") {
                    let n = self.arena_workers().len() + 1;
                    let _ = self.orchestrator.add_worker(
                        "Arena",
                        AgentCell::new(format!("Recrue_{n}"), "auto", "Specialist"),
                    );
                }
            }
            Concept::Delegate => {
                if let Some(id) = self.arena_workers().first().copied() {
                    let _ = self.orchestrator.delegate_task("Arena", (id, "mission"));
                }
            }
            Concept::Audit => {
                if !self.arena_workers().is_empty() {
                    let _ = self
                        .orchestrator
                        .audit_collusion("Arena", ("Worker", 900, true));
                }
            }
            Concept::Immune => {
                use genos_immune::{AntibodyDetector, Antigen};
                if !self
                    .orchestrator
                    .immune_selection
                    .detectors
                    .iter()
                    .any(|d| d.id == "auto")
                {
                    self.orchestrator
                        .immune_selection
                        .detectors
                        .push(AntibodyDetector::new("auto", "THREAT", 0.8));
                }
                let _ = self.orchestrator.detect_immune_threat(&Antigen {
                    id: "threat".to_string(),
                    epitope: "THREAT".to_string(),
                    danger_level: 0.9,
                });
            }
            Concept::Virology => {
                if let Some(index) = self.virology.virions.iter().position(|v| !v.is_neutralized) {
                    self.virology.virions[index].is_neutralized = true;
                }
            }
            Concept::Throttle => {
                let _ = self.throttle_flux(120.0);
            }
            Concept::Therapy => {
                if let Some(id) = self.arena_workers().first().copied() {
                    let _ = self.execute_skill(id, Skill::Heal);
                }
            }
            Concept::Spore => {
                if let Some(id) = self.arena_workers().last().copied() {
                    let _ = self
                        .orchestrator
                        .sporulate_cell(id, SporeType::BacterialEndospore);
                }
            }
            Concept::Glia => {
                self.record_event("GLIA", json!({}));
            }
            Concept::Signaling => {
                let ligand = SignalingCascade::ligand("ATP", SignalingMode::Paracrine, 1.0);
                let _ = self.signaling.emit(ligand);
            }
            Concept::Stigmergy => {
                self.deposit_trail("TRAIL", 1.0);
            }
            Concept::Quorum => {
                self.quorum.add_cells(1);
                self.quorum.step(1.0);
            }
            Concept::Neuro => {
                self.neuro
                    .receive("orchestrator", Neurotransmitter::Dopamine, 1.0);
            }
            Concept::Mutate => {
                if let Some(id) = self.first_dna_agent() {
                    let _ = self.mutate_agent(id);
                }
            }
            Concept::Cross => {
                if let Some(id) = self.first_dna_agent() {
                    let _ = self.crossover_agent(id);
                }
            }
            Concept::Endosymbiosis => {
                let workers = self.arena_workers();
                if workers.len() >= 2 {
                    let _ = self.orchestrator.trigger_endosymbiosis(workers[0], workers[1]);
                }
            }
            Concept::Genomics => {
                if let Some(id) = self.first_dna_agent()
                    && let Some(dna) = self.agent_dna(id)
                {
                    let _ = crate::dna_ops::content_hash(dna);
                }
                self.record_event("GENOMICS", json!({}));
            }
            Concept::Plasmid => {
                let needy: Vec<Uuid> = self
                    .review_agents()
                    .into_iter()
                    .filter(|(_, verdict)| *verdict == Verdict::NeedsPlasmid)
                    .map(|(id, _)| id)
                    .collect();
                for id in needy {
                    self.act_on_verdict(id);
                }
            }
            Concept::Feign => {
                self.record_event("FEIGN", json!({}));
            }
            Concept::Kill => {
                if let Some((id, _)) = self
                    .review_agents()
                    .into_iter()
                    .find(|(_, verdict)| *verdict == Verdict::Cull)
                {
                    self.act_on_verdict(id);
                }
            }
            Concept::Replay => {
                report.verdicts = self.review_agents();
                let ids: Vec<Uuid> = report.verdicts.iter().map(|(id, _)| *id).collect();
                for id in ids {
                    self.act_on_verdict(id);
                }
            }
            Concept::Communicate => {
                self.record_event("HUMAN_ESCALATION", json!({}));
            }
        }
    }
}
