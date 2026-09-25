//! Gouvernance : autorite, baux, approbations, risque.
//!
//! Aucun changement morphogenetique n'est applique sans validation.
//! Pipeline : Resolver -> Proposition -> Plan -> Validation ->
//! Gouvernance -> Snapshot -> Execution -> Recu.

use crate::kernel_morphogenesis::MorphogenesisPlan;
use serde::{Deserialize, Serialize};

/// Decision de gouvernance.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GovernanceDecision {
    pub allowed: bool,
    pub reason: String,
    pub required_approvals: Vec<String>,
}

/// Contexte de validation.
pub struct GovernanceInput<'a> {
    pub plan: &'a MorphogenesisPlan,
    pub authority: &'a str,
    pub risk_level: f64,
    pub degraded_mode: bool,
}

/// Plan de gouvernance : plafonds d'autorite et exigences.
pub struct GovernancePlane {
    pub principal_authority: String,
}

impl Default for GovernancePlane {
    fn default() -> Self {
        Self {
            principal_authority: String::from("orchestrator_principal"),
        }
    }
}

impl GovernancePlane {
    pub fn new() -> Self {
        Self::default()
    }

    /// Valide un plan avant snapshot et execution.
    pub fn validate(&self, input: &GovernanceInput<'_>) -> GovernanceDecision {
        if input.plan.decision_no_change {
            return GovernanceDecision {
                allowed: true,
                reason: String::from("NO_CHANGE : rien a autoriser"),
                required_approvals: Vec::new(),
            };
        }
        self.check_authority(input)
    }

    fn check_authority(&self, input: &GovernanceInput<'_>) -> GovernanceDecision {
        if input.authority != self.principal_authority {
            return GovernanceDecision {
                allowed: false,
                reason: String::from("autorite insuffisante : escalade refusee"),
                required_approvals: vec![String::from("orchestrator_principal")],
            };
        }
        self.check_risk(input)
    }

    fn check_risk(&self, input: &GovernanceInput<'_>) -> GovernanceDecision {
        if input.risk_level > 0.85 {
            return GovernanceDecision {
                allowed: false,
                reason: String::from("risque trop eleve : approbation humaine requise"),
                required_approvals: vec![String::from("approbation_humaine")],
            };
        }
        self.check_degraded(input)
    }

    fn check_degraded(&self, input: &GovernanceInput<'_>) -> GovernanceDecision {
        if input.degraded_mode && input.plan.is_costly_or_risky() {
            return GovernanceDecision {
                allowed: false,
                reason: String::from("mode degrade : changement couteux refuse"),
                required_approvals: vec![String::from("stabilisation_d_abord")],
            };
        }
        GovernanceDecision {
            allowed: true,
            reason: String::from("plan autorise sous autorite principale"),
            required_approvals: input.plan.governance_requirements.clone(),
        }
    }
}
