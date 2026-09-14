//! Boucle cognitive : observer → décider → agir, en un seul `tick`.
//!
//! Chaque tick lit l'état réel, laisse le directeur choisir ses concepts,
//! exécute le plan (replay/diagnostic, recrutement, immunité, soin, plasmide…)
//! et apprend du résultat.

use crate::GenosEcosystem;
use crate::director::Strategy;
use crate::planner::{Concept, Goal};
use crate::trace::Verdict;
use genos_cell::AgentCell;
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

    fn execute_concept(&mut self, concept: Concept, report: &mut TickReport) {
        match concept {
            Concept::Organize => {
                if !self.orchestrator.tissues.contains_key("Arena") {
                    let _ = self.orchestrator.create_tissue("Arena", "Mission");
                }
            }
            Concept::Recruit => {
                if self.orchestrator.tissues.contains_key("Arena") {
                    let n = self
                        .orchestrator
                        .tissues
                        .get("Arena")
                        .map(|t| t.somatic_cells.len())
                        .unwrap_or(0)
                        + 1;
                    let _ = self.orchestrator.add_worker(
                        "Arena",
                        AgentCell::new(format!("Recrue_{n}"), "auto", "Specialist"),
                    );
                }
            }
            Concept::Replay => {
                report.verdicts = self.review_agents();
                let ids: Vec<Uuid> = report.verdicts.iter().map(|(id, _)| *id).collect();
                for id in ids {
                    self.act_on_verdict(id);
                }
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
            _ => {}
        }
    }
}
