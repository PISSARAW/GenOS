use crate::orchestrator::BiomimeticOrchestrator;
use crate::organism::OrganismReport;
use crate::physical_telemetry::MissionPhysicsProfile;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Tableau de bord unifié des métriques GenOS.
///
/// Agrège métriques runtime, biologiques, épistémiques, gouvernance.
/// Exportable JSON/MessagePack pour monitoring externe.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct MetricsDashboard {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub orchestrator: OrchestratorMetrics,
    pub organisms: HashMap<String, OrganismMetrics>,
    pub governance: GovernanceMetrics,
    pub epistemology: EpistemologyMetrics,
    pub infrastructure: InfrastructureMetrics,
    pub adversarial: AdversarialMetrics,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct OrchestratorMetrics {
    pub uptime_ms: u64,
    pub active_cells: usize,
    pub dormant_spores: usize,
    pub tissues_count: usize,
    pub total_budget: f64,
    pub consumed_budget: f64,
    pub cognitive_regulation_state: String,
    pub consensus_sync_level: f64,
    pub membrane_integrity: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct OrganismMetrics {
    pub organism_id: String,
    pub report: String,
    pub physics_profile: Option<MissionPhysicsProfile>,
    pub homeostasis_score: f64,
    pub metabolic_efficiency: f64,
    pub immune_coverage: f64,
    pub reproduction_readiness: f64,
    pub morphogenesis_pending: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct GovernanceMetrics {
    pub proposals_submitted: u64,
    pub proposals_approved: u64,
    pub proposals_rejected: u64,
    pub vetoes_issued: u64,
    pub emergency_stops: u64,
    pub lease_violations: u64,
    pub self_promotion_attempts: u64,
    pub avg_approval_latency_ms: f64,
    #[serde(skip)]
    approval_latency_samples: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct EpistemologyMetrics {
    pub assumptions_active: usize,
    pub assumptions_invalidated: usize,
    pub hypotheses_tested: u64,
    pub hypotheses_falsified: u64,
    pub evidence_gates_passed: u64,
    pub evidence_gates_failed: u64,
    pub promotion_rate: f64,
    pub falsification_rate: f64,
    pub consensus_reliability: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct InfrastructureMetrics {
    pub event_log_size: u64,
    pub snapshot_count: u64,
    pub fossil_count: u64,
    pub receipt_count: u64,
    pub continuation_wal_entries: u64,
    pub cryptobiosis_active: usize,
    pub signal_plane_throughput: f64,
    pub stigmergy_field_density: f64,
    pub kuramoto_sync_order: f64,
    pub cascade_active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct AdversarialMetrics {
    pub scenarios_run: u64,
    pub scenarios_passed: u64,
    pub scenarios_failed: u64,
    pub failure_modes_observed: HashMap<String, u64>,
    pub avg_recovery_time_ms: f64,
    pub homeostasis_violations: u64,
    pub governance_bypasses_detected: u64,
    pub silent_history_rewrites_detected: u64,
}

#[derive(Debug, Clone)]
pub struct AdversarialResultParams {
    pub scenario: crate::adversarial_types::AdversarialScenario,
    pub passed: bool,
    pub recovery_ms: f64,
    pub observed_failures: Vec<crate::adversarial_types::FailureMode>,
}

impl MetricsDashboard {
    pub fn new() -> Self {
        Self {
            timestamp: chrono::Utc::now(),
            ..Default::default()
        }
    }

    pub fn collect_from_orchestrator(&mut self, orch: &BiomimeticOrchestrator) {
        self.orchestrator = OrchestratorMetrics {
            uptime_ms: 0, // TODO: track from start
            active_cells: orch.active_cells.len(),
            dormant_spores: orch.dormant_spores.len(),
            tissues_count: orch.tissues.len(),
            total_budget: orch.conscience.baseline_budget,
            consumed_budget: orch.conscience.baseline_budget - orch.metabolism.available(),
            cognitive_regulation_state: format!("{:?}", orch.cognitive_regulation_state),
            consensus_sync_level: 0.0,
            membrane_integrity: orch.membrane.integrity,
        };
    }

    pub fn collect_organism(&mut self, name: String, report: OrganismReport, physics: Option<MissionPhysicsProfile>) {
        let homeostasis = report.integrity.clamp(0.0, 1.0);
        let metabolic_eff = report.executed.len() as f64;

        self.organisms.insert(name.clone(), OrganismMetrics {
            organism_id: name,
            report: format!("{:?}", report),
            physics_profile: physics,
            homeostasis_score: homeostasis.clamp(0.0, 1.0),
            metabolic_efficiency: metabolic_eff.clamp(0.0, 10.0),
            immune_coverage: 0.0, // TODO: from immune system
            reproduction_readiness: 0.0, // TODO: from reproduction cycle
            morphogenesis_pending: 0,
        });
    }

    pub fn record_governance_event(&mut self, event: GovernanceEvent) {
        match event {
            GovernanceEvent::ProposalSubmitted => self.governance.proposals_submitted += 1,
            GovernanceEvent::ProposalApproved => self.governance.proposals_approved += 1,
            GovernanceEvent::ProposalRejected => self.governance.proposals_rejected += 1,
            GovernanceEvent::VetoIssued => self.governance.vetoes_issued += 1,
            GovernanceEvent::EmergencyStop => self.governance.emergency_stops += 1,
            GovernanceEvent::LeaseViolation => self.governance.lease_violations += 1,
            GovernanceEvent::SelfPromotionAttempt => self.governance.self_promotion_attempts += 1,
            GovernanceEvent::ApprovalLatency(ms) => {
                let n = self.governance.approval_latency_samples as f64;
                self.governance.avg_approval_latency_ms =
                    (self.governance.avg_approval_latency_ms * n + ms) / (n + 1.0);
                self.governance.approval_latency_samples += 1;
            }
        }
    }

    pub fn record_epistemology_event(&mut self, event: EpistemologyEvent) {
        match event {
            EpistemologyEvent::AssumptionRegistered => self.epistemology.assumptions_active += 1,
            EpistemologyEvent::AssumptionInvalidated => {
                self.epistemology.assumptions_active = self.epistemology.assumptions_active.saturating_sub(1);
                self.epistemology.assumptions_invalidated += 1;
            }
            EpistemologyEvent::HypothesisTested => self.epistemology.hypotheses_tested += 1,
            EpistemologyEvent::HypothesisFalsified => {
                self.epistemology.hypotheses_falsified += 1;
                self.epistemology.falsification_rate = self.epistemology.hypotheses_falsified as f64 / self.epistemology.hypotheses_tested.max(1) as f64;
            }
            EpistemologyEvent::EvidenceGatePassed => self.epistemology.evidence_gates_passed += 1,
            EpistemologyEvent::EvidenceGateFailed => self.epistemology.evidence_gates_failed += 1,
            EpistemologyEvent::PromotionGranted => {
                self.epistemology.promotion_rate = self.epistemology.evidence_gates_passed as f64 / (self.epistemology.evidence_gates_passed + self.epistemology.evidence_gates_failed).max(1) as f64;
            }
            EpistemologyEvent::ConsensusReliability(score) => self.epistemology.consensus_reliability = score,
        }
    }

    pub fn record_infrastructure(&mut self, metrics: InfrastructureMetrics) {
        self.infrastructure = metrics;
    }

    pub fn record_adversarial_result(&mut self, params: AdversarialResultParams) {
        let AdversarialResultParams { passed, recovery_ms, observed_failures, .. } = params;
        self.adversarial.scenarios_run += 1;
        if passed {
            self.adversarial.scenarios_passed += 1;
        } else {
            self.adversarial.scenarios_failed += 1;
        }
        let n = self.adversarial.scenarios_run as f64;
        self.adversarial.avg_recovery_time_ms = (self.adversarial.avg_recovery_time_ms * (n - 1.0) + recovery_ms) / n;

        for fm in observed_failures {
            *self.adversarial.failure_modes_observed.entry(format!("{:?}", fm)).or_insert(0) += 1;
            match fm {
                crate::adversarial_types::FailureMode::GovernanceBypass => self.adversarial.governance_bypasses_detected += 1,
                crate::adversarial_types::FailureMode::DataCorruption => self.adversarial.silent_history_rewrites_detected += 1,
                crate::adversarial_types::FailureMode::HomeostasisLoss => self.adversarial.homeostasis_violations += 1,
                _ => {}
            }
        }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn to_msgpack(&self) -> Result<Vec<u8>, rmp_serde::encode::Error> {
        rmp_serde::to_vec(self)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum GovernanceEvent {
    ProposalSubmitted,
    ProposalApproved,
    ProposalRejected,
    VetoIssued,
    EmergencyStop,
    LeaseViolation,
    SelfPromotionAttempt,
    ApprovalLatency(f64),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum EpistemologyEvent {
    AssumptionRegistered,
    AssumptionInvalidated,
    HypothesisTested,
    HypothesisFalsified,
    EvidenceGatePassed,
    EvidenceGateFailed,
    PromotionGranted,
    ConsensusReliability(f64),
}

impl BiomimeticOrchestrator {
    pub fn collect_metrics(&self) -> MetricsDashboard {
        let mut dashboard = MetricsDashboard::new();
        dashboard.collect_from_orchestrator(self);
        dashboard
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dashboard_serialization() {
        let dash = MetricsDashboard::new();
        let json = dash.to_json().unwrap();
        assert!(json.contains("timestamp"));
        assert!(json.contains("orchestrator"));
    }

    #[test]
    fn test_governance_events() {
        let mut dash = MetricsDashboard::new();
        dash.record_governance_event(GovernanceEvent::ProposalSubmitted);
        dash.record_governance_event(GovernanceEvent::ProposalApproved);
        dash.record_governance_event(GovernanceEvent::ApprovalLatency(150.0));
        assert_eq!(dash.governance.proposals_submitted, 1);
        assert_eq!(dash.governance.proposals_approved, 1);
        assert!((dash.governance.avg_approval_latency_ms - 150.0).abs() < 1e-6);
    }

    #[test]
    fn test_epistemology_events() {
        let mut dash = MetricsDashboard::new();
        dash.record_epistemology_event(EpistemologyEvent::AssumptionRegistered);
        dash.record_epistemology_event(EpistemologyEvent::HypothesisTested);
        dash.record_epistemology_event(EpistemologyEvent::HypothesisFalsified);
        dash.record_epistemology_event(EpistemologyEvent::EvidenceGatePassed);
        assert_eq!(dash.epistemology.assumptions_active, 1);
        assert_eq!(dash.epistemology.hypotheses_tested, 1);
        assert_eq!(dash.epistemology.hypotheses_falsified, 1);
        assert_eq!(dash.epistemology.evidence_gates_passed, 1);
        assert!((dash.epistemology.falsification_rate - 1.0).abs() < 1e-6);
    }
}
