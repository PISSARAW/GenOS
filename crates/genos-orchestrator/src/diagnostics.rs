//! Diagnostic d'agent : replay de trace -> verdict -> action sur l'écosystème.
//!
//! C'est ici que l'orchestrateur **décide**, à partir de ce qu'un agent a
//! réellement fait, s'il faut le soigner, le mettre en famine, lui transférer
//! un plasmide (compétence), le supprimer, le muter ou le croiser.

use crate::GenosEcosystem;
use crate::plasmids::PlasmidBank;
use crate::trace::{Outcome, ReplayReport, Verdict};
use genos_biology::specialized_cells::prokaryote::ProkaryoticAgent;
use genos_biology::therapy::{apply_systemic_therapy_to_cell, SystemicTherapy};
use uuid::Uuid;

impl GenosEcosystem {
    /// Enregistre une action d'agent (trace + journal d'événements).
    pub fn record_action(&mut self, agent: Uuid, action: &str, outcome: Outcome) {
        let tick = self.events.count() as u64;
        self.traces.record(agent, tick, action, outcome);
        self.events.append(
            "AGENT_ACTION",
            serde_json::json!({
                "agent": agent.to_string(),
                "action": action,
                "outcome": format!("{outcome:?}"),
            }),
        );
    }

    /// Rejoue la trace d'un agent.
    pub fn replay_agent(&self, agent: Uuid) -> ReplayReport {
        self.traces.replay(agent)
    }

    /// Verdict de destin pour un agent.
    pub fn diagnose_agent(&self, agent: Uuid) -> Verdict {
        self.traces.diagnose(agent)
    }

    /// Revue de tous les agents tracés (triée, déterministe).
    pub fn review_agents(&self) -> Vec<(Uuid, Verdict)> {
        let mut out: Vec<(Uuid, Verdict)> = self
            .traces
            .traces
            .keys()
            .map(|id| (*id, self.traces.diagnose(*id)))
            .collect();
        out.sort_by_key(|(id, _)| *id);
        out
    }

    /// Applique le verdict : soin, famine, plasmide, suppression.
    pub fn act_on_verdict(&mut self, agent: Uuid) -> (Verdict, String) {
        let verdict = self.diagnose_agent(agent);
        let note = match verdict {
            Verdict::Healthy => "sain".to_string(),
            Verdict::Therapy => self.heal(agent),
            Verdict::Starve => self.starve(agent),
            Verdict::NeedsPlasmid => self.grant_plasmid(agent),
            Verdict::Cull => self.cull(agent),
            Verdict::NeedsMutation => "mutation recommandee".to_string(),
            Verdict::NeedsCrossover => "croisement recommande".to_string(),
        };
        (verdict, note)
    }

    fn heal(&mut self, agent: Uuid) -> String {
        match self.orchestrator.active_cells.get_mut(&agent) {
            Some(cell) => {
                let outcome =
                    apply_systemic_therapy_to_cell(&SystemicTherapy::IntensiveCareFluids, cell);
                format!("soin applique ({})", outcome.therapy_name)
            }
            None => "agent absent".to_string(),
        }
    }

    fn starve(&mut self, agent: Uuid) -> String {
        match self.orchestrator.active_cells.get_mut(&agent) {
            Some(cell) => {
                cell.conscience.current_budget = (cell.conscience.current_budget * 0.2).max(0.0);
                "famine : budget reduit".to_string()
            }
            None => "agent absent".to_string(),
        }
    }

    fn grant_plasmid(&mut self, agent: Uuid) -> String {
        let plasmid = PlasmidBank::skill("auto_skill", "repair", "PAYLOAD");
        let id = plasmid.plasmid_id.clone();
        self.plasmids.add(plasmid.clone());
        // Le donneur devient conjugatif et porte le plasmide.
        self.prokaryote.has_sex_pilus = true;
        if !self.prokaryote.plasmids.iter().any(|p| p.plasmid_id == id) {
            self.prokaryote.plasmids.push(plasmid);
        }
        let mut recipient = ProkaryoticAgent::new(&agent.to_string());
        match self.plasmids.transfer(&self.prokaryote, &mut recipient, &id) {
            Ok(_) => "plasmide transfere".to_string(),
            Err(error) => format!("transfert echoue : {error}"),
        }
    }

    fn cull(&mut self, agent: Uuid) -> String {
        if self.orchestrator.active_cells.remove(&agent).is_some() {
            for tissue in self.orchestrator.tissues.values_mut() {
                tissue.somatic_cells.retain(|id| *id != agent);
            }
            "agent supprime".to_string()
        } else {
            "agent absent".to_string()
        }
    }
}
