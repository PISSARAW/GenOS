//! Diagnostic d'agent : replay de trace -> verdict -> action sur l'écosystème.
//!
//! C'est ici que l'orchestrateur **décide**, à partir de ce qu'un agent a
//! réellement fait, s'il faut le soigner, le mettre en famine, lui transférer
//! un plasmide (compétence), le supprimer, le muter ou le croiser.

use crate::GenosEcosystem;
use crate::dna_ops;
use crate::plasmids::{PlasmidBank, Skill};
use crate::trace::{Outcome, ReplayReport, Verdict};
use genos_biology::specialized_cells::prokaryote::ProkaryoticAgent;
use genos_biology::therapy::{apply_systemic_therapy_to_cell, SystemicTherapy};
use genos_dna::model::AgentDna;
use genos_dna::operations::{CrossOptions, MutateOptions};
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
            Verdict::NeedsMutation => self.mutate_agent(agent),
            Verdict::NeedsCrossover => self.crossover_agent(agent),
        };
        (verdict, note)
    }

    // --- Registre ADN + génétique exécutable ---

    pub fn register_dna(&mut self, agent: Uuid, dna: AgentDna) {
        self.agent_dna.insert(agent, dna);
    }

    pub fn agent_dna(&self, agent: Uuid) -> Option<&AgentDna> {
        self.agent_dna.get(&agent)
    }

    fn sync_genome_id(&mut self, agent: Uuid, dna: &AgentDna) {
        if let Ok(genome) = dna.to_genome()
            && let Some(cell) = self.orchestrator.active_cells.get_mut(&agent)
        {
            cell.genome_id = Some(genome.genome_id());
        }
    }

    fn mutate_agent(&mut self, agent: Uuid) -> String {
        let Some(dna) = self.agent_dna.get(&agent).cloned() else {
            return "aucun ADN enregistre : mutation impossible".to_string();
        };
        let options = MutateOptions {
            rate: 0.1,
            hyper: false,
            locus: None,
            seed: Some(agent.to_string()),
        };
        match dna_ops::mutate_dna(&dna, &options) {
            Ok(mutated) => {
                self.agent_dna.insert(agent, mutated.clone());
                self.sync_genome_id(agent, &mutated);
                "mutation appliquee".to_string()
            }
            Err(error) => format!("mutation echouee : {error}"),
        }
    }

    fn crossover_agent(&mut self, agent: Uuid) -> String {
        let Some(dna) = self.agent_dna.get(&agent).cloned() else {
            return "aucun ADN enregistre : croisement impossible".to_string();
        };
        let partner = self.agent_dna.keys().copied().find(|id| *id != agent);
        let Some(partner_id) = partner else {
            return "aucun partenaire ADN pour le croisement".to_string();
        };
        let partner_dna = self
            .agent_dna
            .get(&partner_id)
            .cloned()
            .expect("partenaire present");
        let options = CrossOptions {
            swap_prob: 0.5,
            point: Some(2),
            seed: Some(agent.to_string()),
            speciation_threshold: None,
        };
        match dna_ops::cross_dna(&dna, &partner_dna, &options) {
            Ok(child) => {
                self.agent_dna.insert(agent, child.clone());
                self.sync_genome_id(agent, &child);
                format!("croisement applique avec {}", partner_id)
            }
            Err(error) => format!("croisement echoue : {error}"),
        }
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
        let plasmid = PlasmidBank::for_skill(Skill::Repair);
        let id = plasmid.plasmid_id.clone();
        self.plasmids.add(plasmid.clone());
        // Le donneur devient conjugatif et porte le plasmide.
        self.prokaryote.has_sex_pilus = true;
        if !self.prokaryote.plasmids.iter().any(|p| p.plasmid_id == id) {
            self.prokaryote.plasmids.push(plasmid);
        }
        let mut recipient = ProkaryoticAgent::new(&agent.to_string());
        match self.plasmids.transfer(&self.prokaryote, &mut recipient, &id) {
            Ok(_) => "plasmide (SKILL_REPAIR) transfere".to_string(),
            Err(error) => format!("transfert echoue : {error}"),
        }
    }

    /// Exécute une compétence portée par un plasmide sur un agent.
    pub fn execute_skill(&mut self, agent: Uuid, skill: Skill) -> String {
        match skill {
            Skill::Heal => self.heal(agent),
            Skill::Throttle => {
                let throttle = self.throttle_flux(120.0);
                format!("throttle applique (flux admis {:.1})", throttle.admitted_flux)
            }
            Skill::Repair => match self.orchestrator.active_cells.get_mut(&agent) {
                Some(cell) => {
                    cell.conscience.current_budget = cell.conscience.baseline_budget;
                    "budget cognitif restaure".to_string()
                }
                None => "agent absent".to_string(),
            },
            Skill::Verify => {
                if self.orchestrator.active_cells.contains_key(&agent) {
                    "verification OK".to_string()
                } else {
                    "verification : agent absent".to_string()
                }
            }
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
