//! Receipt base structure and validation
//! Part of genos-common receipt schema

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use uuid::Uuid;

use crate::receipt_kinds::*;

/// Base receipt fields (all receipts have these)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiptBase {
    pub receipt_id: Uuid,
    pub schema_version: String,
    pub kind: ReceiptKind,
    pub mission_id: Option<Uuid>,
    pub run_id: Option<Uuid>,
    pub event_id: Option<Uuid>,
    pub actor_id: Option<Uuid>,
    pub capability_id: Option<String>,
    pub input_hash: Option<String>,
    pub output_hash: Option<String>,
    pub authorization: Option<AuthorizationRef>,
    pub budget_cost: Option<BudgetCost>,
    pub status: ReceiptStatus,
    pub failure_reason: Option<String>,
    pub provenance: ProvenanceInfo,
    pub created_at: DateTime<Utc>,
}

/// Kind-specific payloads
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BiologicalExecutionReceipt {
    #[serde(flatten)]
    pub base: ReceiptBase,
    pub tick: Option<i64>,
    pub operation: String,
    pub consumed: bool,
    pub completed: bool,
    pub execution_scope: ExecutionScope,
    pub cell_id: Option<Uuid>,
    pub genome_id: Option<Uuid>,
    pub homeostasis_state_id: Option<Uuid>,
    pub homeostasis_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CellDivisionReceipt {
    #[serde(flatten)]
    pub base: ReceiptBase,
    pub parent_cell_id: Option<Uuid>,
    pub daughter_cell_id: Option<Uuid>,
    pub parent_genome_id: Option<Uuid>,
    pub daughter_genome_id: Option<Uuid>,
    pub lineage_id: Option<Uuid>,
    pub generation: Option<u32>,
    pub completed: bool,
    pub requested_cost: f64,
    pub consumed_cost: f64,
    pub cost_unit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeostasisTransitionReceipt {
    #[serde(flatten)]
    pub base: ReceiptBase,
    pub from_status: String,
    pub to_status: String,
    pub threshold: String,
    pub trigger: String,
    pub controller_decision: ControllerDecision,
    pub revision_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityExecutionReceipt {
    #[serde(flatten)]
    pub base: ReceiptBase,
    pub capability: String,
    pub params: HashMap<String, serde_json::Value>,
    pub result: Option<HashMap<String, serde_json::Value>>,
    pub duration_ms: Option<u64>,
}

/// Union type for any receipt
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AnyReceipt {
    BiologicalExecution(BiologicalExecutionReceipt),
    CellDivision(CellDivisionReceipt),
    HomeostasisTransition(HomeostasisTransitionReceipt),
    CapabilityExecution(CapabilityExecutionReceipt),
    Base(ReceiptBase),
}

/// Errors
#[derive(Debug, Error)]
pub enum ReceiptError {
    #[error("Invalid UUID v4: {0}")]
    InvalidUuid(String),
    #[error("Unknown receipt kind: {0}")]
    UnknownKind(String),
    #[error("Invalid status: {0}")]
    InvalidStatus(String),
    #[error("failure_reason required when status != Success")]
    MissingFailureReason,
    #[error("Invalid created_at timestamp: {0}")]
    InvalidTimestamp(String),
    #[error("Schema validation error: {0}")]
    ValidationError(String),
    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),
}

/// Validate receipt structure
pub fn validate_receipt(receipt: &AnyReceipt) -> Result<(), ReceiptError> {
    let base = match receipt {
        AnyReceipt::BiologicalExecution(r) => &r.base,
        AnyReceipt::CellDivision(r) => &r.base,
        AnyReceipt::HomeostasisTransition(r) => &r.base,
        AnyReceipt::CapabilityExecution(r) => &r.base,
        AnyReceipt::Base(r) => r,
    };

    if base.receipt_id.get_version() != Some(uuid::Version::Random) {
        return Err(ReceiptError::InvalidUuid(base.receipt_id.to_string()));
    }

    if base.schema_version != RECEIPT_SCHEMA_VERSION {
        return Err(ReceiptError::ValidationError(format!(
            "schema_version mismatch: expected {}, got {}",
            RECEIPT_SCHEMA_VERSION, base.schema_version
        )));
    }

    if matches!(base.status, ReceiptStatus::Refused | ReceiptStatus::Failed | ReceiptStatus::Timeout) 
        && base.failure_reason.is_none() {
        return Err(ReceiptError::MissingFailureReason);
    }

    let _ = base.created_at.timestamp();

    Ok(())
}

/// Generate new receipt ID (UUID v4)
pub fn generate_receipt_id() -> Uuid {
    Uuid::new_v4()
}

/// Canonical JSON for hashing (deterministic key order)
pub fn canonical_json(value: &serde_json::Value) -> Result<String, ReceiptError> {
    let map = if let serde_json::Value::Object(obj) = value {
        obj.clone()
    } else {
        return Err(ReceiptError::ValidationError("Expected JSON object".into()));
    };
    let mut entries: Vec<_> = map.into_iter().collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let ordered: serde_json::Map<_, _> = entries.into_iter().collect();
    Ok(serde_json::to_string(&ordered)?)
}

/// Schema migration: read old versions
pub fn migrate_receipt(value: serde_json::Value) -> Result<serde_json::Value, ReceiptError> {
    let version = value.get("schema_version")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0.0");
    
    match version {
        "1.0.0" => Ok(value),
        _ => Err(ReceiptError::ValidationError(format!("Unsupported schema version: {}", version))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_receipt_kind_roundtrip() {
        for kind in [
            ReceiptKind::BiologicalExecution,
            ReceiptKind::CellDivision,
            ReceiptKind::CapabilityExecution,
        ] {
            let s = kind.as_str();
            assert_eq!(ReceiptKind::from_str(s), Some(kind));
        }
    }

    #[test]
    fn test_generate_receipt_id() {
        let id = generate_receipt_id();
        assert_eq!(id.get_version(), Some(uuid::Version::Random));
    }

    #[test]
    fn test_canonical_json_deterministic() {
        let val = serde_json::json!({"b": 2, "a": 1, "c": {"z": 26, "y": 25}});
        let c1 = canonical_json(&val).unwrap();
        let c2 = canonical_json(&val).unwrap();
        assert_eq!(c1, c2);
        assert!(c1.starts_with("{\"a\":"));
    }

    #[test]
    fn test_validate_receipt_success() {
        let receipt = AnyReceipt::Base(ReceiptBase {
            receipt_id: Uuid::new_v4(),
            schema_version: RECEIPT_SCHEMA_VERSION.to_string(),
            kind: ReceiptKind::CapabilityExecution,
            mission_id: None,
            run_id: None,
            event_id: None,
            actor_id: None,
            capability_id: Some("test.capability".into()),
            input_hash: None,
            output_hash: None,
            authorization: None,
            budget_cost: None,
            status: ReceiptStatus::Success,
            failure_reason: None,
            provenance: ProvenanceInfo {
                source: ProvenanceSource::Test,
                signature: None,
                nonce: None,
                runner_id: None,
                environment_hash: None,
            },
            created_at: Utc::now(),
        });
        assert!(validate_receipt(&receipt).is_ok());
    }

    #[test]
    fn test_validate_receipt_failure_requires_reason() {
        let receipt = AnyReceipt::Base(ReceiptBase {
            receipt_id: Uuid::new_v4(),
            schema_version: RECEIPT_SCHEMA_VERSION.to_string(),
            kind: ReceiptKind::CapabilityExecution,
            mission_id: None,
            run_id: None,
            event_id: None,
            actor_id: None,
            capability_id: Some("test.capability".into()),
            input_hash: None,
            output_hash: None,
            authorization: None,
            budget_cost: None,
            status: ReceiptStatus::Failed,
            failure_reason: None,
            provenance: ProvenanceInfo {
                source: ProvenanceSource::Test,
                signature: None,
                nonce: None,
                runner_id: None,
                environment_hash: None,
            },
            created_at: Utc::now(),
        });
        assert!(matches!(validate_receipt(&receipt), Err(ReceiptError::MissingFailureReason)));
    }
}