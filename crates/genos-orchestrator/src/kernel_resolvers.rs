//! Resolvers : l'orchestrateur arbitre, il ne reimplemente pas.
//!
//! Chaque resolver produit une `Proposal` (jamais une action immediate).
//! Le plan morphogenetique valide ensuite l'ensemble sous gouvernance.

use crate::kernel_diagnosis::{Diagnosis, FailureType};
use crate::kernel_state::OrchestratorState;
use serde::{Deserialize, Serialize};

/// Proposition emise par un resolver.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Proposal {
    pub resolver: String,
    pub action: String,
    pub target: String,
    pub gain: f64,
    pub cost: f64,
}

/// Contexte d'appel des resolvers.
pub struct ResolverInput<'a> {
    pub state: &'a OrchestratorState,
    pub diagnosis: &'a Diagnosis,
}

/// Collection de toutes les propositions.
#[derive(Clone, Debug, Default)]
pub struct ProposalSet {
    pub items: Vec<Proposal>,
}

impl ProposalSet {
    pub fn push(&mut self, proposal: Proposal) {
        self.items.push(proposal);
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

/// Spec d'une proposition (regroupe les champs pour le gate).
pub struct ProposalSpec<'a> {
    pub resolver: &'a str,
    pub action: &'a str,
    pub target: &'a str,
    pub gain: f64,
    pub cost: f64,
}

fn push_spec(set: &mut ProposalSet, spec: &ProposalSpec<'_>) {
    set.push(Proposal {
        resolver: spec.resolver.to_string(),
        action: spec.action.to_string(),
        target: spec.target.to_string(),
        gain: spec.gain,
        cost: spec.cost,
    });
}

fn emit(set: &mut ProposalSet, spec: &ProposalSpec<'_>) {
    let gains = gain_for(spec.action);
    push_spec(set, &ProposalSpec { resolver: spec.resolver, action: spec.action, target: spec.target, gain: gains.0, cost: gains.1 });
}

fn spec<'a>(resolver: &'a str, action: &'a str, target: &'a str) -> ProposalSpec<'a> {
    ProposalSpec { resolver, action, target, gain: 0.0, cost: 0.0 }
}

fn gain_for(action: &str) -> (f64, f64) {
    match action {
        open if open == "spawn_verifier" => (0.35, 0.08),
        open if open == "assign_independent_model" => (0.3, 0.06),
        open if open == "change_topology" => (0.3, 0.12),
        open if open == "request_capability" => (0.35, 0.07),
        open if open == "isolate_worker" => (0.4, 0.05),
        open if open == "reprofile_mission" => (0.25, 0.05),
        _ => (0.2, 0.04),
    }
}

/// Appelle tous les resolvers puis retourne l'ensemble des propositions.
pub fn resolve_all(input: &ResolverInput<'_>) -> ProposalSet {
    let mut set = ProposalSet::default();
    collect_epistemic(input, &mut set);
    collect_cognitive(input, &mut set);
    collect_structural(input, &mut set);
    collect_resources(input, &mut set);
    set
}

fn collect_epistemic(input: &ResolverInput<'_>, set: &mut ProposalSet) {
    match input.diagnosis.failure {
        FailureType::Epistemic => emit(set, &spec("EpistemicResolver", "spawn_verifier", "scope_courant")),
        FailureType::Model => emit(set, &spec("ModelResolver", "assign_independent_model", "verifier_1")),
        FailureType::Environmental => emit(set, &spec("EnvironmentResolver", "reprofile_mission", "mission")),
        _ => {}
    }
    if input.state.epistemics.uncertainties.len() > 3 {
        emit(set, &spec("NicheResolver", "spawn_probe", "zone_incertaine"));
    }
}

fn collect_cognitive(input: &ResolverInput<'_>, set: &mut ProposalSet) {
    match input.diagnosis.failure {
        FailureType::Cognitive => emit(set, &spec("CognitivePhenotypeResolver", "change_recipe", "worker_cible")),
        FailureType::Strategic => emit(set, &spec("StrategyResolver", "change_strategy", "scope_courant")),
        FailureType::Procedural => emit(set, &spec("ProceduralResolver", "activate_procedure", "scope_courant")),
        _ => {}
    }
}

fn collect_structural(input: &ResolverInput<'_>, set: &mut ProposalSet) {
    match input.diagnosis.failure {
        FailureType::Capability => emit(set, &spec("CapabilityResolver", "request_capability", "scope_courant")),
        FailureType::Topology => emit(set, &spec("TopologyResolver", "change_topology", "scope_courant")),
        FailureType::Communication => {
            emit(set, &spec("CommunicationResolver", "adjust_physiology", "scope_courant"))
        }
        FailureType::Pathological => emit(set, &spec("ClinicalPlanner", "isolate_worker", "worker_pathologique")),
        _ => {}
    }
    if input.state.collective.subgraphs.len() > 1 {
        emit(set, &spec("RelationResolver", "bridge_subgraphs", "interfaces"));
    }
}

fn collect_resources(input: &ResolverInput<'_>, set: &mut ProposalSet) {
    match input.diagnosis.failure {
        FailureType::Resource => emit(set, &spec("ResourceAllocator", "shrink_topology", "scope_courant")),
        _ => {}
    }
    if input.state.budget_pressure() > 0.8 {
        emit(set, &spec("ResiliencePlanner", "degrade_gracefully", "mission"));
    }
    if input.state.governance.risk_level > 0.7 {
        emit(set, &spec("GovernancePlane", "require_approval", "plan"));
    }
}
