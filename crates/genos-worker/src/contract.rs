//! Contrat commun a tous les workers GenOS.
//!
//! Tous les workers partagent le meme squelette runtime ; seules
//! persistence, scope, autorite, adaptation, memoire, communication,
//! strategie, spawn, topologie et obligations d'evidence varient.

use serde::{Deserialize, Serialize};

/// Identite d'incarnation d'un worker.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorkerIdentity {
    pub agent_id: String,
    pub parent_id: Option<String>,
    pub lineage: Vec<String>,
    pub phenotype: String,
}

/// Mission bornee confiee au worker.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorkerMission {
    pub objective: String,
    pub scope: String,
    pub success_criteria: Vec<String>,
    pub stop_conditions: Vec<String>,
}

/// Niche fonctionnelle du worker.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorkerNiche {
    pub environment: String,
    pub function: String,
    pub domain: Option<String>,
}

/// Autorite effective. Jamais auto-extensible (invariant 1).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthorityProfile {
    pub read: bool,
    pub execute: bool,
    pub write: bool,
    pub delegate: bool,
    pub spawn: bool,
    pub topology_change: bool,
    pub genome_change: bool,
}

impl Default for AuthorityProfile {
    fn default() -> Self {
        Self {
            read: true,
            execute: false,
            write: false,
            delegate: false,
            spawn: false,
            topology_change: false,
            genome_change: false,
        }
    }
}

/// Acces memoire par systeme.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryProfile {
    pub working: bool,
    pub episodic: bool,
    pub semantic: String,
    pub procedural: String,
    pub ancestral: bool,
}

impl Default for MemoryProfile {
    fn default() -> Self {
        Self {
            working: true,
            episodic: true,
            semantic: "bounded".to_string(),
            procedural: "bounded".to_string(),
            ancestral: false,
        }
    }
}

/// Droits de communication.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CommsProfile {
    pub policy: String,
    pub allowed_targets: Vec<String>,
    pub max_messages: u32,
}

/// Budget de ressources alloue.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ResourceBudget {
    pub tokens: u64,
    pub time_ms: u64,
    pub cpu_ms: u64,
}

/// Obligations d'evidence.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EvidenceSpec {
    pub required_artifacts: Vec<String>,
    pub provenance_required: bool,
}

/// Politiques de resilience.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ResilienceSpec {
    pub max_retries: u32,
    pub checkpoint_each_n_steps: u32,
}

/// Cycle de vie.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LifecycleSpec {
    pub ttl_ms: Option<u64>,
    pub max_iterations: Option<u32>,
}

/// Contrat runtime commun. Rempli differemment par chaque phenotype.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorkerRuntimeContract {
    pub identity: WorkerIdentity,
    pub mission: WorkerMission,
    pub niche: WorkerNiche,
    pub cognitive_recipe: Option<String>,
    pub allowed_recipe_changes: bool,
    pub allowed_strategies: Vec<String>,
    pub local_strategy_changes: bool,
    pub expressed_capabilities: Vec<String>,
    pub requestable_capabilities: Vec<String>,
    pub authority: AuthorityProfile,
    pub tool_lease: Vec<String>,
    pub memory: MemoryProfile,
    pub comms: CommsProfile,
    pub resources: ResourceBudget,
    pub evidence: EvidenceSpec,
    pub resilience: ResilienceSpec,
    pub lifecycle: LifecycleSpec,
    pub max_strategy_changes: u32,
    pub max_cognitive_changes: u32,
}

/// Erreur de validation du contrat.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContractError {
    pub field: String,
    pub reason: String,
}

fn err(field: &str, reason: &str) -> ContractError {
    ContractError {
        field: field.to_string(),
        reason: reason.to_string(),
    }
}

fn check_mission(contract: &WorkerRuntimeContract, out: &mut Vec<ContractError>) {
    if contract.mission.objective.trim().is_empty() {
        out.push(err("mission.objective", "objective requis"));
    }
    if contract.mission.scope.trim().is_empty() {
        out.push(err("mission.scope", "scope requis"));
    }
}

fn check_spawn_coherence(contract: &WorkerRuntimeContract, out: &mut Vec<ContractError>) {
    if !contract.authority.spawn && contract.lifecycle.max_iterations.is_none() {
        return;
    }
    if contract.authority.spawn && contract.resources.tokens == 0 {
        out.push(err("resources.tokens", "spawn exige un budget tokens"));
    }
}

fn check_evidence(contract: &WorkerRuntimeContract, out: &mut Vec<ContractError>) {
    if contract.evidence.required_artifacts.is_empty() {
        out.push(err("evidence.required_artifacts", "au moins un artefact requis"));
    }
}

fn check_lease(contract: &WorkerRuntimeContract, out: &mut Vec<ContractError>) {
    if contract.authority.execute && contract.tool_lease.is_empty() {
        out.push(err("tool_lease", "execute exige un lease d'outils"));
    }
}

/// Valide qu'un contrat est incarnable.
pub fn validate_contract(contract: &WorkerRuntimeContract) -> Vec<ContractError> {
    let mut out = Vec::new();
    check_mission(contract, &mut out);
    check_spawn_coherence(contract, &mut out);
    check_evidence(contract, &mut out);
    check_lease(contract, &mut out);
    out
}
