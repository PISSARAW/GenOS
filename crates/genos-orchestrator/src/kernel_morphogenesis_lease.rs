//! Autorite delegatee pour les transitions morphologiques locales.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MorphogenesisLease {
    pub node_id: String,
    pub allowed_node_ids: Vec<String>,
    pub allowed_operators: Vec<String>,
    pub allowed_topologies: Vec<String>,
    pub state_boundaries: Vec<String>,
    pub authority_ceiling: Vec<String>,
    pub max_workers: u32,
    pub max_depth: u32,
    pub token_budget: u64,
    pub transition_budget: u32,
    pub expires_at_unix_secs: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LocalMorphogenesisRequest {
    pub node_id: String,
    pub affected_node_ids: Vec<String>,
    pub operations: Vec<String>,
    pub topologies: Vec<String>,
    pub state_boundaries: Vec<String>,
    pub required_authority: Vec<String>,
    pub workers: u32,
    pub depth: u32,
    pub token_cost: u64,
    pub transition_cost: u32,
    pub global_mutation: bool,
}

impl MorphogenesisLease {
    pub fn authorizes(&self, request: &LocalMorphogenesisRequest, now: u64) -> bool {
        !request.global_mutation && now < self.expires_at_unix_secs
            && self.scope_valid(request) && self.changes_valid(request)
            && self.boundaries_valid(request) && self.budget_valid(request)
    }

    fn scope_valid(&self, request: &LocalMorphogenesisRequest) -> bool {
        request.node_id == self.node_id
            && request.affected_node_ids.iter().all(|id| self.allowed_node_ids.contains(id))
    }

    fn changes_valid(&self, request: &LocalMorphogenesisRequest) -> bool {
        request.operations.iter().all(|op| self.allowed_operators.contains(op))
            && request.topologies.iter().all(|item| self.allowed_topologies.contains(item))
    }

    fn boundaries_valid(&self, request: &LocalMorphogenesisRequest) -> bool {
        request.state_boundaries.iter().all(|item| self.state_boundaries.contains(item))
            && request.required_authority.iter().all(|item| self.authority_ceiling.contains(item))
    }

    fn budget_valid(&self, request: &LocalMorphogenesisRequest) -> bool {
        request.workers <= self.max_workers && request.depth <= self.max_depth
            && request.token_cost <= self.token_budget && request.transition_cost <= self.transition_budget
    }
}
