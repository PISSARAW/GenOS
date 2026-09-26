//! Moteur de décision de recrutement.
//!
//! Séparation stricte : `RecruitmentPlanner` **décide** (qui recruter, qui
//! refuser, pourquoi, dans quel budget), `GenosEcosystem::execute_recruitment`
//! **exécute** la décision. Trois niveaux de politique :
//! - licence : recruter un agent par rôle requis ;
//! - master : couvrir des capacités, avec concurrence entre candidats ;
//! - doctorat : refus si budget insuffisant et détection d'imposteurs
//!   (capacités déclarées non prouvées).

use crate::GenosEcosystem;
use genos_cell::AgentCell;
use uuid::Uuid;

/// Offre d'un agent candidat, dérivée de son ADN et de ses preuves.
#[derive(Clone, Debug)]
pub struct Candidate {
    pub id: String,
    pub role: String,
    /// Capacités déclarées (ADN / phénotype).
    pub capabilities: Vec<String>,
    /// Capacités effectivement prouvées (évidence, tests).
    pub proven: Vec<String>,
    /// Coût d'activation estimé.
    pub cost: f64,
}

impl Candidate {
    /// Facteur de confiance : fraction des capacités déclarées qui sont prouvées.
    pub fn trust(&self) -> f64 {
        if self.capabilities.is_empty() {
            return 1.0;
        }
        let proven = self
            .capabilities
            .iter()
            .filter(|cap| self.proven.contains(cap))
            .count() as f64;
        (proven / self.capabilities.len() as f64).clamp(0.0, 1.0)
    }

    /// Imposteur potentiel : déclare des capacités mais n'en prouve aucune.
    pub fn is_impostor(&self, min_trust: f64) -> bool {
        !self.capabilities.is_empty() && self.trust() < min_trust
    }

    /// Le candidat couvre-t-il une clé (rôle ou capacité) ?
    pub fn covers(&self, key: &str) -> bool {
        self.role == key || self.capabilities.iter().any(|cap| cap == key)
    }
}

/// Exigences d'une mission.
#[derive(Clone, Debug, Default)]
pub struct Demand {
    pub roles: Vec<String>,
    pub capabilities: Vec<String>,
    pub budget: f64,
}

/// Un recrutement retenu.
#[derive(Clone, Debug)]
pub struct Selection {
    pub key: String,
    pub candidate: String,
    pub role: String,
    pub score: f64,
    pub cost: f64,
}

/// Décision finale, traçable et reproductible.
#[derive(Clone, Debug)]
pub struct RecruitmentDecision {
    pub selected: Vec<Selection>,
    /// (candidat ou "", raison).
    pub rejected: Vec<(String, String)>,
    pub spent: f64,
    pub feasible: bool,
}

/// Politique de recrutement configurable.
#[derive(Clone, Debug)]
pub struct RecruitmentPlanner {
    pub max_agents: usize,
    pub min_trust: f64,
}

impl Default for RecruitmentPlanner {
    fn default() -> Self {
        Self {
            max_agents: 8,
            min_trust: 0.25,
        }
    }
}

impl RecruitmentPlanner {
    pub fn new(max_agents: usize, min_trust: f64) -> Self {
        Self {
            max_agents,
            min_trust,
        }
    }

    fn score(&self, candidate: &Candidate) -> f64 {
        candidate.trust() * 10.0 - candidate.cost * 0.001
    }

    fn collect_keys(&self, demand: &Demand) -> Vec<String> {
        let mut keys: Vec<String> = Vec::new();
        for key in demand.roles.iter().chain(demand.capabilities.iter()) {
            if !keys.contains(key) {
                keys.push(key.clone());
            }
        }
        keys.sort();
        keys
    }

    fn mark_impostors(&self, candidates: &[Candidate], keys: &[String], rejected: &mut Vec<(String, String)>) {
        for candidate in candidates {
            if candidate.is_impostor(self.min_trust) && keys.iter().any(|key| candidate.covers(key)) {
                rejected.push((
                    candidate.id.clone(),
                    format!(
                        "imposteur: capacite non prouvee (trust {:.2})",
                        candidate.trust()
                    ),
                ));
            }
        }
    }

    fn is_key_covered(&self, key: &str, chosen: &[String], candidates: &[Candidate]) -> bool {
        chosen.iter().any(|id| candidates.iter().any(|c| &c.id == id && c.covers(key)))
    }

    fn check_max_agents(&self, chosen: &[String], key: &str, decision: &mut RecruitmentDecision) -> bool {
        if chosen.len() >= self.max_agents {
            decision.rejected.push((String::new(), format!("capacite max atteinte pour '{key}'")));
            decision.feasible = false;
            true
        } else {
            false
        }
    }

    fn find_eligible(&self, candidates: &[Candidate], chosen: &[String], key: &str) -> Vec<&Candidate> {
        candidates
            .iter()
            .filter(|c| !c.is_impostor(self.min_trust) && !chosen.contains(&c.id) && c.covers(key))
            .collect()
    }

    fn check_eligible(&self, eligible: &[&Candidate], key: &str, decision: &mut RecruitmentDecision) -> bool {
        if eligible.is_empty() {
            decision.rejected.push((String::new(), format!("aucun candidat pour '{key}'")));
            decision.feasible = false;
            true
        } else {
            false
        }
    }

    fn find_affordable(&self, eligible: &[&Candidate], demand: &Demand, spent: f64) -> Vec<&Candidate> {
        eligible
            .iter()
            .copied()
            .filter(|c| spent + c.cost <= demand.budget)
            .collect()
    }

    fn check_affordable(&self, affordable: &[&Candidate], key: &str, decision: &mut RecruitmentDecision) -> bool {
        if affordable.is_empty() {
            decision.rejected.push((String::new(), format!("budget insuffisant pour '{key}'")));
            decision.feasible = false;
            true
        } else {
            false
        }
    }

    fn select_best(&self, affordable: &[&Candidate]) -> &Candidate {
        let mut best = affordable[0];
        for candidate in &affordable[1..] {
            let better = self.score(candidate) > self.score(best)
                || (self.score(candidate) == self.score(best) && candidate.id < best.id);
            if better {
                best = candidate;
            }
        }
best
    }
}

struct AddSelectionInput<'a> {
    decision: &'a mut RecruitmentDecision,
    key: String,
    best: &'a Candidate,
    chosen: &'a mut Vec<String>,
}

pub fn plan(&self, demand: &Demand, candidates: &[Candidate]) -> RecruitmentDecision {
        let keys = self.collect_keys(demand);

        let mut decision = RecruitmentDecision {
            selected: Vec::new(),
            rejected: Vec::new(),
            spent: 0.0,
            feasible: true,
        };
        let mut chosen: Vec<String> = Vec::new();

        self.mark_impostors(candidates, &keys, &mut decision.rejected);

        for key in &keys {
            if self.is_key_covered(key, &chosen, candidates) {
                continue;
            }
            if self.check_max_agents(&chosen, key, &mut decision) {
                continue;
            }

            let eligible = self.find_eligible(candidates, &chosen, key);
            if self.check_eligible(&eligible, key, &mut decision) {
                continue;
            }

            let affordable = self.find_affordable(&eligible, demand, decision.spent);
            if self.check_affordable(&affordable, key, &mut decision) {
                continue;
            }

            let best = self.select_best(&affordable);
            self.add_selection(AddSelectionInput {
                decision: &mut decision,
                key: key.clone(),
                best,
                chosen: &mut chosen,
            });
        }

        decision
    }
}

impl GenosEcosystem {
    pub fn recruit(
        &mut self,
        tissue: &str,
        demand: &Demand,
        candidates: &[Candidate],
    ) -> RecruitmentDecision {
        let decision = self.recruiter.plan(demand, candidates);
        if decision.feasible {
            let _ = self.execute_recruitment(tissue, &decision, candidates);
        }
        decision
    }

    pub fn execute_recruitment(
        &mut self,
        tissue: &str,
        decision: &RecruitmentDecision,
        candidates: &[Candidate],
    ) -> Result<Vec<Uuid>, String> {
        if !self.orchestrator.tissues.contains_key(tissue) {
            self.orchestrator.create_tissue(tissue, "Recrues")?;
        }
        let mut ids = Vec::new();
        for selection in &decision.selected {
            let candidate = candidates
                .iter()
                .find(|c| c.id == selection.candidate)
                .ok_or_else(|| format!("candidat inconnu: {}", selection.candidate))?;
            let cell = AgentCell::new(
                candidate.id.clone(),
                candidate.role.clone(),
                candidate.role.clone(),
            );
            let id = self.orchestrator.add_worker(tissue, cell)?;
            self.orchestrator.delegate_task(tissue, (id, "mission"))?;
            ids.push(id);
        }
        Ok(ids)
    }
}