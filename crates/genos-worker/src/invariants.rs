//! Les 20 invariants universels des workers.
//!
//! Regles non negociables, verifiees a chaque action a impact.

use crate::contract::WorkerRuntimeContract;
use serde::{Deserialize, Serialize};

/// Action a impact proposee par un worker.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ActionRequest {
    pub kind: String,
    pub uses_lease: bool,
    pub tool: Option<String>,
    pub wants_spawn: bool,
    pub wants_authority_gain: bool,
    pub wants_topology_change: bool,
    pub wants_genome_change: bool,
    pub scope: String,
    pub has_receipt: bool,
}

/// Violation d'un invariant.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct InvariantViolation {
    pub rule: u8,
    pub message: String,
}

fn deny(rule: u8, message: &str) -> InvariantViolation {
    InvariantViolation {
        rule,
        message: message.to_string(),
    }
}

fn check_authority_gain(contract: &WorkerRuntimeContract, action: &ActionRequest) -> Option<InvariantViolation> {
    if action.wants_authority_gain {
        return Some(deny(1, "un worker ne peut jamais augmenter sa propre autorite"));
    }
    if action.wants_topology_change && !contract.authority.topology_change {
        return Some(deny(5, "changement de topologie non autorise"));
    }
    if action.wants_genome_change && !contract.authority.genome_change {
        return Some(deny(6, "mutation DNA non autorisee"));
    }
    None
}

fn check_lease(contract: &WorkerRuntimeContract, action: &ActionRequest) -> Option<InvariantViolation> {
    if !action.uses_lease {
        return None;
    }
    match action.tool.as_deref() {
        None => Some(deny(2, "outil hors lease")),
        Some(tool) if contract.tool_lease.iter().any(|t| t == tool) => None,
        Some(_) => Some(deny(2, "outil hors lease courant")),
    }
}

fn check_spawn(contract: &WorkerRuntimeContract, action: &ActionRequest) -> Option<InvariantViolation> {
    if action.wants_spawn && !contract.authority.spawn {
        return Some(deny(8, "spawn exige une permission explicite"));
    }
    None
}

fn check_scope(contract: &WorkerRuntimeContract, action: &ActionRequest) -> Option<InvariantViolation> {
    if action.scope.trim().is_empty() {
        return None;
    }
    if action.scope != contract.mission.scope {
        return Some(deny(13, "travail hors scope : signaler au parent au lieu d'elargir"));
    }
    None
}

fn check_receipt(action: &ActionRequest) -> Option<InvariantViolation> {
    let impacting = ["write", "spawn", "delegate", "topology", "execute"];
    let is_impacting = impacting.iter().any(|k| action.kind.contains(k));
    if is_impacting && !action.has_receipt {
        return Some(deny(15, "toute action a impact produit un receipt"));
    }
    None
}

/// Verifie une action contre les invariants applicables.
pub fn check_action(contract: &WorkerRuntimeContract, action: &ActionRequest) -> Vec<InvariantViolation> {
    let mut out = Vec::new();
    for check in [
        check_authority_gain(contract, action),
        check_lease(contract, action),
        check_spawn(contract, action),
        check_scope(contract, action),
        check_receipt(action),
    ] {
        if let Some(violation) = check {
            out.push(violation);
        }
    }
    out
}

/// Un succes sans preuve n'est pas un succes verifie (invariant 9).
pub fn is_verified_success(has_artifacts: bool, has_provenance: bool) -> bool {
    has_artifacts && has_provenance
}
