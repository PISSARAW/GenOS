use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Registre des hypothèses et assumptions explicites.
///
/// Chaque hypothèse est versionnée, tracée à son origine, et peut être
/// invalidée avec preuve. Conforme ADR 0313, 0314, 0317.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AssumptionRegistry {
    assumptions: HashMap<Uuid, Assumption>,
    invalidated: HashMap<Uuid, InvalidationRecord>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Assumption {
    pub id: Uuid,
    pub statement: String,
    pub domain: AssumptionDomain,
    pub confidence: ConfidenceLevel,
    pub source: AssumptionSource,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub depends_on: Vec<Uuid>,
    pub falsification_criteria: Option<String>,
    pub evidence_refs: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum AssumptionDomain {
    Architecture,
    Runtime,
    Security,
    Epistemology,
    Biology,
    Governance,
    Performance,
    Other(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum ConfidenceLevel {
    Speculative,
    Plausible,
    Supported,
    Strong,
    Verified,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum AssumptionSource {
    HumanDesign { author: String, adr_ref: Option<String> },
    RuntimeObservation { observer: String, trace_id: String },
    BenchmarkResult { benchmark: String, run_id: String },
    AdversarialTest { test: String, finding: String },
    External { source: String, url: Option<String> },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InvalidationRecord {
    pub assumption_id: Uuid,
    pub invalidated_at: chrono::DateTime<chrono::Utc>,
    pub reason: String,
    pub evidence: String,
    pub invalidated_by: String,
    pub replacement: Option<Uuid>,
}

#[derive(Debug, Clone)]
pub struct InvalidationParams {
    pub reason: String,
    pub evidence: String,
    pub by: String,
    pub replacement: Option<Uuid>,
}

impl AssumptionRegistry {
    pub fn new() -> Self {
        Self {
            assumptions: HashMap::new(),
            invalidated: HashMap::new(),
        }
    }

    pub fn register(&mut self, assumption: Assumption) -> Uuid {
        let id = assumption.id;
        self.assumptions.insert(id, assumption);
        id
    }

    pub fn get(&self, id: Uuid) -> Option<&Assumption> {
        self.assumptions.get(&id)
    }

    pub fn invalidate(&mut self, id: Uuid, params: InvalidationParams) -> Result<(), String> {
        if let Some(assumption) = self.assumptions.remove(&id) {
            let record = InvalidationRecord {
                assumption_id: id,
                invalidated_at: chrono::Utc::now(),
                reason: params.reason,
                evidence: params.evidence,
                invalidated_by: params.by,
                replacement: params.replacement,
            };
            self.invalidated.insert(id, record);
            Ok(())
        } else {
            Err(format!("Assumption {} not found or already invalidated", id))
        }
    }

    pub fn list_active(&self, domain: Option<AssumptionDomain>) -> Vec<&Assumption> {
        self.assumptions
            .values()
            .filter(|a| domain.as_ref().map_or(true, |d| &a.domain == d))
            .collect()
    }

    pub fn list_invalidated(&self) -> Vec<&InvalidationRecord> {
        self.invalidated.values().collect()
    }

    pub fn dependency_graph(&self) -> HashMap<Uuid, Vec<Uuid>> {
        self.assumptions
            .iter()
            .map(|(id, a)| (*id, a.depends_on.clone()))
            .collect()
    }
}

impl Default for AssumptionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_and_invalidate() {
        let mut reg = AssumptionRegistry::new();
        let id = reg.register(Assumption {
            id: Uuid::new_v4(),
            statement: "Organisme computationnel maintient homéostasie sous charge".into(),
            domain: AssumptionDomain::Biology,
            confidence: ConfidenceLevel::Plausible,
            source: AssumptionSource::HumanDesign { author: "architect".into(), adr_ref: Some("0037".into()) },
            created_at: chrono::Utc::now(),
            depends_on: vec![],
            falsification_criteria: Some("Échec récupération après perturbation > 5% budget".into()),
            evidence_refs: vec!["test_organism_homeostasis".into()],
        });

        assert!(reg.get(id).is_some());
        reg.invalidate(id, InvalidationParams {
            reason: "Contre-exemple trouvé".into(),
            evidence: "test_apex_adversarial_defense_bench: échec 12%".into(),
            by: "ci-bot".into(),
            replacement: None,
        }).unwrap();
        assert!(reg.get(id).is_none());
        assert_eq!(reg.list_invalidated().len(), 1);
    }

    #[test]
    fn test_confidence_ordering() {
        assert!(ConfidenceLevel::Speculative < ConfidenceLevel::Plausible);
        assert!(ConfidenceLevel::Plausible < ConfidenceLevel::Supported);
        assert!(ConfidenceLevel::Supported < ConfidenceLevel::Strong);
        assert!(ConfidenceLevel::Strong < ConfidenceLevel::Verified);
    }
}
