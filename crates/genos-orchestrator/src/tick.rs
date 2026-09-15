//! Boucle cognitive : observer → décider → agir, en un seul `tick`, et
//! `run` qui itère jusqu'à l'arrêt en produisant un rapport global.

use crate::GenosEcosystem;
use crate::director::Strategy;
use crate::learning::context_from_state;
use crate::planner::{Concept, Goal};
use crate::plasmids::Skill;
use crate::signaling::SignalingCascade;
use crate::trace::Verdict;
use genos_biology::neurobiology::Neurotransmitter;
use genos_biology::pathology::assess_agent_clinical_status;
use genos_biology::spore::SporeType;
use genos_cell::{AgentCell, ClinicalState};
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
    pub goals: Vec<String>,
}

impl GenosEcosystem {
    /// Un cycle complet : observer, décider, exécuter, apprendre.
    pub fn tick(&mut self, goal: &Goal) -> TickReport {
        // Autopoïèse : la frontière se dégrade ; rompue, l'organisme meurt.
        self.orchestrator.membrane.update();
        if !self.orchestrator.membrane.is_alive() {
            return TickReport {
                tick: self.events.count() as u64,
                strategy: Strategy::Solo,
                organization: "n/a",
                superorganism: "n/a",
                planned: Vec::new(),
                executed: Vec::new(),
                halt: Some("organisme mort: membrane rompue".to_string()),
                verdicts: Vec::new(),
            };
        }
        self.maintain_autopoiesis();
        let state = self.observe();
        if state.apoptotic { return TickReport { tick: self.events.count() as u64, strategy: Strategy::Solo, organization: "n/a", superorganism: "n/a", planned: Vec::new(), executed: Vec::new(), halt: Some("etat apoptotique: volition inhibee".to_string()), verdicts: Vec::new() }; }
        // Voie sous-corticale : les instincts sont évalués avant la délibération.
        self.run_instincts(&state);
        self.director.set_context(context_from_state(&state));
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
            self.attempt_autonomous_reproduction_if_alive();
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
        // Assignation de crédit + reproduction autonome (sans opérateur, hors du plan).
        let episode_reward = if sim.goal_reached(goal) { 1.0 } else { 0.0 };
        self.director.assign_credit(&report.executed, episode_reward);
        self.attempt_autonomous_reproduction_if_alive();
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
            goals: vec![format!("{goal:?}")],
        }
    }

    /// Exécute une séquence de concepts donnée (utilisé par les mondes isolés).
    pub fn execute_concepts(&mut self, concepts: &[Concept]) -> Vec<Concept> {
        let mut report = TickReport {
            tick: 0,
            strategy: Strategy::Solo,
            organization: "n/a",
            superorganism: "n/a",
            planned: concepts.to_vec(),
            executed: Vec::new(),
            halt: None,
            verdicts: Vec::new(),
        };
        for concept in concepts {
            self.execute_concept(*concept, &mut report);
            report.executed.push(*concept);
        }
        report.executed
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

    fn active_virions(&self) -> usize {
        self.virology
            .virions
            .iter()
            .filter(|v| !v.is_neutralized)
            .count()
    }

    /// Guérit cliniquement la première cellule malade du tissu.
    fn cure_one_diseased(&mut self) -> bool {
        let target = self.arena_workers().into_iter().find(|id| {
            self.orchestrator
                .active_cells
                .get(id)
                .map(|cell| !assess_agent_clinical_status(cell).is_healthy)
                .unwrap_or(false)
        });
        if let Some(id) = target
            && let Some(cell) = self.orchestrator.active_cells.get_mut(&id)
        {
            cell.clinical = ClinicalState::healthy();
            return true;
        }
        false
    }

    fn first_diseased(&self) -> Option<Uuid> {
        self.arena_workers().into_iter().find(|id| {
            self.orchestrator
                .active_cells
                .get(id)
                .map(|cell| !assess_agent_clinical_status(cell).is_healthy)
                .unwrap_or(false)
        })
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
                    if let Ok(id) = self.orchestrator.add_worker(
                        "Arena",
                        AgentCell::new(format!("Recrue_{n}"), "auto", "Specialist"),
                    ) {
                        // Tout agent recruté reçoit un ADN (mutation/croisement possibles).
                        let genome = genos_genome::Genome::new(&format!("RECRUE_{n}"));
                        let dna = crate::dna_ops::from_genome(&genome, &format!("Recrue_{n}"));
                        self.register_dna(id, dna);
                    }
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
                // L'immunité neutralise une menace active — sauf adversaire non trompé.
                if self.active_virions() < 2
                    && let Some(index) =
                        self.virology.virions.iter().position(|v| !v.is_neutralized)
                {
                    self.virology.virions[index].is_neutralized = true;
                }
            }
            Concept::Virology => {
                if self.active_virions() < 2
                    && let Some(index) =
                        self.virology.virions.iter().position(|v| !v.is_neutralized)
                {
                    self.virology.virions[index].is_neutralized = true;
                }
            }
            Concept::Throttle => {
                let _ = self.throttle_flux(120.0);
            }
            Concept::Therapy => {
                if !self.cure_one_diseased()
                    && let Some(id) = self.arena_workers().first().copied()
                {
                    let _ = self.execute_skill(id, Skill::Heal);
                }
            }
            Concept::Spore => {
                // Quarantaine : sporule une cellule malade en priorité.
                let target = self.first_diseased().or_else(|| self.arena_workers().last().copied());
                if let Some(id) = target {
                    let _ = self
                        .orchestrator
                        .sporulate_cell(id, SporeType::BacterialEndospore);
                }
            }
            Concept::Glia => {
                let note = self.glial_pass();
                let mut cured = 0;
                while cured < 2 && self.cure_one_diseased() {
                    cured += 1;
                }
                self.record_event("GLIA", json!({ "note": note, "cured": cured }));
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
                let note = match self.first_dna_agent() {
                    Some(id) => self.feign(id),
                    None => "aucun ADN : feinte ignoree".to_string(),
                };
                // Leurre : les virions sont trompés/absorbés (cohérence avec la simulation).
                for virion in self.virology.virions.iter_mut() {
                    virion.is_neutralized = true;
                }
                self.record_event("FEIGN", json!({ "note": note }));
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
                let answer = self.communicate("Ping");
                self.record_event("HUMAN", json!({ "answer": answer }));
            }
            Concept::Actuate => {
                // L'action externe est gérée par la boucle incarnée (Environment).
            }
        }
    }
}
