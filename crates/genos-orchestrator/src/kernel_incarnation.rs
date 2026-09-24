//! Incarnation unique des agents + niveaux d'autonomie.
//!
//! L'orchestrateur ne bricole jamais un worker : il emet une
//! `AgentIncarnationRequest`, et `AgentIncarnationService` construit
//! le DNA, le phenotype, les capacites, le bail, l'autorite, la memoire,
//! les relations, le modele, le workspace et le manifeste.

use serde::{Deserialize, Serialize};

/// Niveaux d'autonomie stricts.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutonomyLevel {
    ScoutCell,
    AdaptiveWorker,
    SubOrchestrator,
    PrincipalOrchestrator,
}

impl AutonomyLevel {
    pub fn can_write(self) -> bool {
        match self {
            Self::ScoutCell => false,
            _ => true,
        }
    }

    pub fn can_spawn(self) -> bool {
        match self {
            Self::SubOrchestrator => true,
            Self::PrincipalOrchestrator => true,
            _ => false,
        }
    }

    pub fn can_change_topology(self) -> bool {
        match self {
            Self::PrincipalOrchestrator => true,
            _ => false,
        }
    }

    pub fn can_change_local_strategy(self) -> bool {
        match self {
            Self::ScoutCell => false,
            _ => true,
        }
    }
}

/// Demande d'incarnation emise par l'orchestrateur.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentIncarnationRequest {
    pub phenotype: String,
    pub mission_scope: String,
    pub capabilities: Vec<String>,
    pub authority_profile: String,
    pub strategy_envelope: Vec<String>,
    pub cognitive_recipe: Vec<String>,
    pub prefer_independent_model: bool,
    pub budget_tokens: u64,
    pub ttl_minutes: u64,
    pub autonomy: AutonomyLevel,
}

/// Agent incarne : le seul format valide d'un worker.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IncarnatedAgent {
    pub agent_id: String,
    pub phenotype: String,
    pub scope: String,
    pub capabilities: Vec<String>,
    pub authority_profile: String,
    pub strategy_envelope: Vec<String>,
    pub cognitive_recipe: Vec<String>,
    pub model: String,
    pub lease: String,
    pub workspace: String,
}

/// Contraintes d'un sous-orchestrateur delegue.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubOrchestratorEnvelope {
    pub scope: String,
    pub budget_tokens: u64,
    pub authority_ceiling: String,
    pub worker_limit: usize,
    pub strategy_envelope: Vec<String>,
    pub topology_options: Vec<String>,
    pub ttl_minutes: u64,
}

/// Service unique de construction des agents.
pub struct AgentIncarnationService {
    counter: u64,
}

impl Default for AgentIncarnationService {
    fn default() -> Self {
        Self { counter: 0 }
    }
}

/// Parametres de derivation du modele.
pub struct ModelChoice {
    pub prefer_independent: bool,
    pub host_runtime: String,
}

impl AgentIncarnationService {
    pub fn new() -> Self {
        Self::default()
    }

    /// Incarne un agent à partir d'une requete validee.
    pub fn incarnate(&mut self, request: &AgentIncarnationRequest) -> Result<IncarnatedAgent, String> {
        self.validate(request)?;
        self.counter += 1;
        let choice = ModelChoice {
            prefer_independent: request.prefer_independent_model,
            host_runtime: String::from("codex_native"),
        };
        Ok(IncarnatedAgent {
            agent_id: format!("{}_{}", request.phenotype, self.counter),
            phenotype: request.phenotype.clone(),
            scope: request.mission_scope.clone(),
            capabilities: request.capabilities.clone(),
            authority_profile: request.authority_profile.clone(),
            strategy_envelope: request.strategy_envelope.clone(),
            cognitive_recipe: request.cognitive_recipe.clone(),
            model: Self::pick_model(&choice),
            lease: format!("lease_{}", self.counter),
            workspace: format!("vfs://agents/{}_{}", request.phenotype, self.counter),
        })
    }

    fn validate(&self, request: &AgentIncarnationRequest) -> Result<(), String> {
        if request.phenotype.is_empty() {
            return Err(String::from("phenotype requis"));
        }
        if request.mission_scope.is_empty() {
            return Err(String::from("mission_scope requis"));
        }
        if request.capabilities.is_empty() {
            return Err(String::from("au moins une capacite requise"));
        }
        if request.budget_tokens == 0 {
            return Err(String::from("budget nul refuse"));
        }
        self.check_spawn_rights(request)
    }

    fn check_spawn_rights(&self, request: &AgentIncarnationRequest) -> Result<(), String> {
        match request.autonomy {
            AutonomyLevel::ScoutCell => self.check_scout(request),
            _ => Ok(()),
        }
    }

    fn check_scout(&self, request: &AgentIncarnationRequest) -> Result<(), String> {
        if request.strategy_envelope.len() > 1 {
            return Err(String::from("scout : envelope strategique restreinte"));
        }
        Ok(())
    }

    fn pick_model(choice: &ModelChoice) -> String {
        match choice.prefer_independent {
            true => String::from("independent_frontier_model"),
            false => choice.host_runtime.clone(),
        }
    }

    /// Construit l'enveloppe d'un sous-orchestrateur de domaine.
    pub fn suborchestrator_envelope(&self, scope: &str) -> SubOrchestratorEnvelope {
        SubOrchestratorEnvelope {
            scope: scope.to_string(),
            budget_tokens: 8000,
            authority_ceiling: String::from("suborchestrator"),
            worker_limit: 6,
            strategy_envelope: vec![String::from("falsification"), String::from("bayesien")],
            topology_options: vec![String::from("syncytium"), String::from("rhizome")],
            ttl_minutes: 60,
        }
    }
}
