//! Laboratoire ephemere inspire de DiCode pour explorer une lacune de responsabilite.
//!
//! Le banc ne touche jamais un systeme reel. Ses observations restent pedagogiques
//! et synthetiques ; elles peuvent seulement orienter une mesure independante.

use serde::{Deserialize, Serialize};

/// Nature de l'environnement observe par une preuve.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceEnvironment {
    SyntheticEducational,
    RealSystem,
}

/// Lacune de responsabilite a falsifier dans un laboratoire borne.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResponsibilityGap {
    pub decision_id: String,
    pub expected_owner: String,
    pub unresolved_obligation: String,
}

/// Budget non extensible d'un banc temporaire.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DreamBudget {
    pub max_test_runs: u32,
    pub max_sensor_samples: u32,
    pub max_elapsed_ms: u64,
}

/// Demande de creation du banc. Le demandeur ne choisit pas son environnement.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BenchRequest {
    pub gap: ResponsibilityGap,
    pub budget: DreamBudget,
}

/// Banc genere pour une seule lacune, sans acces production.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TemporaryResponsibilityBench {
    pub bench_id: String,
    pub gap: ResponsibilityGap,
    pub environment: EvidenceEnvironment,
    pub production_access: bool,
    pub ephemeral: bool,
    pub budget: DreamBudget,
    consumed_test_runs: u32,
    consumed_sensor_samples: u32,
    consumed_elapsed_ms: u64,
    retired: bool,
}

/// Une execution du capteur synthétique.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyntheticProbe {
    pub observed_owner: String,
    pub sensor_samples: u32,
    pub elapsed_ms: u64,
    pub evidence_refs: Vec<String>,
}

/// Observation issue du banc, explicitement impropre a une promotion directe.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SyntheticFinding {
    pub bench_id: String,
    pub decision_id: String,
    pub responsibility_gap_observed: bool,
    pub evidence_refs: Vec<String>,
    pub environment: EvidenceEnvironment,
    pub production_proof: bool,
    pub promotion_eligible: bool,
}

/// Refus explicites du laboratoire.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DreamLabError {
    InvalidGap,
    InvalidBudget,
    BudgetExceeded,
    NonSyntheticEvidence,
    BenchRetired,
}

fn valid_gap(gap: &ResponsibilityGap) -> bool {
    !gap.decision_id.trim().is_empty()
        && !gap.expected_owner.trim().is_empty()
        && !gap.unresolved_obligation.trim().is_empty()
}

fn valid_budget(budget: DreamBudget) -> bool {
    budget.max_test_runs > 0
        && budget.max_sensor_samples > 0
        && budget.max_elapsed_ms > 0
}

fn synthetic_refs(refs: &[String]) -> bool {
    !refs.is_empty()
        && refs.iter().all(|item| {
            item.starts_with("fixture://") || item.starts_with("synthetic://")
        })
}

impl TemporaryResponsibilityBench {
    /// Consomme une execution sous les trois plafonds du budget.
    pub fn observe(&mut self, probe: SyntheticProbe) -> Result<SyntheticFinding, DreamLabError> {
        if self.retired {
            return Err(DreamLabError::BenchRetired);
        }
        if !synthetic_refs(&probe.evidence_refs) {
            return Err(DreamLabError::NonSyntheticEvidence);
        }
        let next_runs = self.consumed_test_runs.saturating_add(1);
        let next_samples = self.consumed_sensor_samples.saturating_add(probe.sensor_samples);
        let next_elapsed = self.consumed_elapsed_ms.saturating_add(probe.elapsed_ms);
        if next_runs > self.budget.max_test_runs
            || next_samples > self.budget.max_sensor_samples
            || next_elapsed > self.budget.max_elapsed_ms
        {
            return Err(DreamLabError::BudgetExceeded);
        }
        self.consumed_test_runs = next_runs;
        self.consumed_sensor_samples = next_samples;
        self.consumed_elapsed_ms = next_elapsed;
        Ok(SyntheticFinding {
            bench_id: self.bench_id.clone(),
            decision_id: self.gap.decision_id.clone(),
            responsibility_gap_observed: probe.observed_owner != self.gap.expected_owner,
            evidence_refs: probe.evidence_refs,
            environment: EvidenceEnvironment::SyntheticEducational,
            production_proof: false,
            promotion_eligible: false,
        })
    }

    /// Retire definitivement le banc et son autorite d'observation.
    pub fn retire(&mut self) {
        self.retired = true;
    }

    pub fn is_retired(&self) -> bool {
        self.retired
    }
}

/// Genere un banc confine et temporaire pour une lacune precise.
pub fn build_responsibility_bench(
    request: BenchRequest,
) -> Result<TemporaryResponsibilityBench, DreamLabError> {
    if !valid_gap(&request.gap) {
        return Err(DreamLabError::InvalidGap);
    }
    if !valid_budget(request.budget) {
        return Err(DreamLabError::InvalidBudget);
    }
    Ok(TemporaryResponsibilityBench {
        bench_id: format!("dream:{}", request.gap.decision_id),
        gap: request.gap,
        environment: EvidenceEnvironment::SyntheticEducational,
        production_access: false,
        ephemeral: true,
        budget: request.budget,
        consumed_test_runs: 0,
        consumed_sensor_samples: 0,
        consumed_elapsed_ms: 0,
        retired: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> BenchRequest {
        BenchRequest {
            gap: ResponsibilityGap {
                decision_id: "decision-17".to_string(),
                expected_owner: "release-owner".to_string(),
                unresolved_obligation: "rollback sans responsable".to_string(),
            },
            budget: DreamBudget {
                max_test_runs: 1,
                max_sensor_samples: 4,
                max_elapsed_ms: 20,
            },
        }
    }

    #[test]
    fn bench_is_ephemeral_synthetic_and_production_denied() {
        let bench = build_responsibility_bench(request()).unwrap();
        assert_eq!(bench.environment, EvidenceEnvironment::SyntheticEducational);
        assert!(bench.ephemeral);
        assert!(!bench.production_access);
    }

    #[test]
    fn finding_never_becomes_production_proof() {
        let mut bench = build_responsibility_bench(request()).unwrap();
        let finding = bench.observe(SyntheticProbe {
            observed_owner: "".to_string(),
            sensor_samples: 4,
            elapsed_ms: 20,
            evidence_refs: vec!["fixture://missing-owner".to_string()],
        }).unwrap();
        assert!(finding.responsibility_gap_observed);
        assert!(!finding.production_proof);
        assert!(!finding.promotion_eligible);
    }

    #[test]
    fn budget_and_evidence_origin_fail_closed() {
        let mut bench = build_responsibility_bench(request()).unwrap();
        let live_ref = SyntheticProbe {
            observed_owner: "release-owner".to_string(),
            sensor_samples: 1,
            elapsed_ms: 1,
            evidence_refs: vec!["prod://release-17".to_string()],
        };
        assert_eq!(bench.observe(live_ref), Err(DreamLabError::NonSyntheticEvidence));
        let too_many = SyntheticProbe {
            observed_owner: "release-owner".to_string(),
            sensor_samples: 5,
            elapsed_ms: 1,
            evidence_refs: vec!["synthetic://release-17".to_string()],
        };
        assert_eq!(bench.observe(too_many), Err(DreamLabError::BudgetExceeded));
        bench.retire();
        assert!(bench.is_retired());
    }
}
