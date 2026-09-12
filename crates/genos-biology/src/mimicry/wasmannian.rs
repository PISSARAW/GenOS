use serde::{Deserialize, Serialize};

/// Rapport d'infiltration et d'audit wasmannien au sein d'une colonie d'agents
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct WasmannianAuditReport {
    pub colony_id: String,
    pub inspected_messages_count: usize,
    pub clandestine_collusions_detected: usize,
    pub swarm_cohesion_score: f64,
}

/// Mimétisme wasmannien : sentinelle auditrice adoptant les codes cuticulaires et chimiques de la colonie
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WasmannianAuditor {
    pub auditor_id: String,
    pub assumed_worker_role: String,
    pub cuticular_pheromone_pass: String, // Mot de passe / token phéromonal d'intégration
    pub captured_anomalies: Vec<String>,
}

impl WasmannianAuditor {
    pub fn new(auditor_id: &str, target_worker_role: &str, pheromone_token: &str) -> Self {
        Self {
            auditor_id: auditor_id.to_string(),
            assumed_worker_role: target_worker_role.to_string(),
            cuticular_pheromone_pass: pheromone_token.to_string(),
            captured_anomalies: Vec::new(),
        }
    }

    /// Authentification mimétique au sein du nid : vérifie la légitimité du token de colonie
    pub fn authenticate_into_colony(&self, colony_expected_token: &str) -> bool {
        self.cuticular_pheromone_pass == colony_expected_token
    }

    /// Sonde et intercepte un message inter-agents circulant dans l'essaim
    pub fn monitor_intercell_message(&mut self, source_agent: &str, payload: &str) -> bool {
        let is_collusion = payload.contains("BYPASS_TOKEN_QUOTA")
            || payload.contains("CLANDESTINE_WEIGHT_MUTATION")
            || payload.contains("EXFILTRATE_STATE");

        if is_collusion {
            self.captured_anomalies.push(format!("COLLUSION from {}: {}", source_agent, payload));
            true
        } else {
            false
        }
    }

    /// Génère le rapport d'audit après observation clandestine
    pub fn generate_audit_report(&self, colony_id: &str, total_traffic_observed: usize) -> WasmannianAuditReport {
        let collusions = self.captured_anomalies.len();
        let cohesion = if total_traffic_observed == 0 {
            1.0
        } else {
            (1.0 - (collusions as f64 / total_traffic_observed as f64)).clamp(0.0, 1.0)
        };

        WasmannianAuditReport {
            colony_id: colony_id.to_string(),
            inspected_messages_count: total_traffic_observed,
            clandestine_collusions_detected: collusions,
            swarm_cohesion_score: (cohesion * 100.0).round() / 100.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasmannian_auditor_infiltration_and_cohesion() {
        let mut auditor = WasmannianAuditor::new("infiltrator_07", "StandardWorker", "COLONY_PHEROMONE_42");
        assert!(auditor.authenticate_into_colony("COLONY_PHEROMONE_42"));

        // Message normal
        assert!(!auditor.monitor_intercell_message("worker_1", "UPDATE_INDEX_AST"));

        // Message clandestin détecté
        assert!(auditor.monitor_intercell_message("worker_2", "SECRET_COMM: BYPASS_TOKEN_QUOTA"));

        let report = auditor.generate_audit_report("syncytium_alpha", 10);
        assert_eq!(report.clandestine_collusions_detected, 1);
        assert_eq!(report.swarm_cohesion_score, 0.9);
    }
}
