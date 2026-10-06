//! Comportements avancés exécutés par l'orchestrateur : feinte (ADN leurre),
//! pipeline glial complet, communication via le thalamus.

use crate::GenosEcosystem;
use crate::dna_ops;
use crate::planner::Goal;
use crate::tick::MissionReport;
use genos_biology::glial::glial_cell::Metabolism;
use genos_biology::{GlialCell, GlialEnvironment};
use genos_dna::operations::DecoyOptions;
use serde_json::json;
use uuid::Uuid;

impl GenosEcosystem {
    /// Feinte : insère un leurre (decoy) dans l'ADN d'un agent.
    pub fn feign(&mut self, agent: Uuid) -> String {
        let Some(dna) = self.agent_dna.get(&agent).cloned() else {
            return "aucun ADN enregistre : feinte impossible".to_string();
        };
        let options = DecoyOptions {
            target_selector: "predator".to_string(),
            detectability: 0.2,
            marker: b"decoy".to_vec(),
        };
        match dna_ops::decoy_dna(&dna, &options) {
            Ok(decoyed) => {
                self.agent_dna.insert(agent, decoyed);
                "feinte appliquee (ADN leurre)".to_string()
            }
            Err(error) => format!("feinte echouee : {error}"),
        }
    }

    /// Exécute le pipeline glial complet (collecte, agrégation, application).
    pub fn glial_pass(&self) -> String {
        let mut cell = GlialCell {
            cell_id: "glial-0".to_string(),
            metabolism: Metabolism { atp_budget: 10.0 },
            astrocyte: None,
            myelinator: None,
            microglia: None,
            ependymal: None,
            nervous_system: None,
        };
        let (mut bhe, mut plaques, mut csf, mut pressure) = (1.0_f64, 0.0, 1.0, 1.0);
        let env = GlialEnvironment {
            bhe_integrity: &mut bhe,
            amyloid_plaques: &mut plaques,
            csf_volume: &mut csf,
            csf_pressure: &mut pressure,
            is_sleeping: false,
            drainage_blocked: false,
        };
        self.glial.process_all(std::slice::from_mut(&mut cell), env);
        format!("pipeline glial execute (BHE {bhe:.2})")
    }

    /// Communication : consultée via le thalamus (LLM) si la feature `api` est active.
    pub fn communicate(&self, prompt: &str) -> String {
        #[cfg(feature = "api")]
        {
            crate::thalamus::consult(prompt, 1)
        }
        #[cfg(not(feature = "api"))]
        {
            format!("escalade humaine (feature api desactivee) : {prompt}")
        }
    }
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn classify_goal(lower: &str) -> Goal {
    if contains_any(lower, &["répar", "repar", "bug", "compile"]) {
        Goal::RepairModule
    } else if contains_any(lower, &["soign", "guér", "guer", "récup", "recup"]) {
        Goal::RecoverAgent
    } else {
        Goal::SecurePerimeter
    }
}

fn push_budget_constraint(lower: &str, out: &mut Vec<String>) {
    if lower.contains("budget") {
        out.push("budget_serre".to_string());
    }
}

fn push_urgence_constraint(lower: &str, out: &mut Vec<String>) {
    if contains_any(lower, &["urgence", "critique"]) {
        out.push("urgence".to_string());
    }
}

fn push_autonomy_constraint(lower: &str, out: &mut Vec<String>) {
    if lower.contains("sans") && lower.contains("humain") {
        out.push("autonomie_totale".to_string());
    }
}

fn collect_constraints(lower: &str) -> Vec<String> {
    let mut constraints = Vec::new();
    push_budget_constraint(lower, &mut constraints);
    push_urgence_constraint(lower, &mut constraints);
    push_autonomy_constraint(lower, &mut constraints);
    constraints
}

impl GenosEcosystem {
    /// Interprète une mission en langage naturel -> but + contraintes.
    ///
    /// Consultée via le thalamus si la feature `api` est active ; sinon repli
    /// déterministe par mots-clés (testable hors ligne).
    pub fn interpret_mission(&self, mission: &str) -> (Goal, Vec<String>) {
        let _ = self.communicate(&format!("Classe cette mission: {mission}"));
        let lower = mission.to_lowercase();
        (classify_goal(&lower), collect_constraints(&lower))
    }

    /// Interprète une mission textuelle puis l'exécute via `run`.
    pub fn run_mission(&mut self, mission: &str, max_ticks: usize) -> MissionReport {
        let (goal, constraints) = self.interpret_mission(mission);
        if !constraints.is_empty() {
            self.record_event("MISSION_CONSTRAINTS", json!({ "constraints": constraints }));
        }
        self.run(&goal, max_ticks)
    }
}
