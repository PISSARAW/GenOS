//! Receipt kinds and constants
//! Part of genos-common receipt schema

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Current receipt schema version
pub const RECEIPT_SCHEMA_VERSION: &str = "1.0.0";

/// Receipt kind discriminants
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReceiptKind {
    BiologicalExecution,
    CellDivision,
    HomeostasisTransition,
    ClinicalApplication,
    Reproduction,
    QuorumResponse,
    CnidocyteAction,
    StreamFiltered,
    PolymorphicRendered,
    FluxThrottled,
    PipelineOssified,
    HgtTransfer,
    MissionSuccession,
    Fossilization,
    CausalAnalysis,
    AeisPromotion,
    CapabilityExecution,
}

impl ReceiptKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ReceiptKind::BiologicalExecution => "genos.biological-execution-receipt/v1",
            ReceiptKind::CellDivision => "genos.cell-division-receipt/v1",
            ReceiptKind::HomeostasisTransition => "genos.homeostasis-transition-receipt/v1",
            ReceiptKind::ClinicalApplication => "genos.clinical-application/v1",
            ReceiptKind::Reproduction => "genos.reproduction-event/v1",
            ReceiptKind::QuorumResponse => "genos.neuro-glia-quorum-response/v1",
            ReceiptKind::CnidocyteAction => "genos.cnidocyte-action/v1",
            ReceiptKind::StreamFiltered => "genos.choanocyte-stream-filtered/v1",
            ReceiptKind::PolymorphicRendered => "genos.iridophore-rendered/v1",
            ReceiptKind::FluxThrottled => "genos.guard-cell-flux-throttled/v1",
            ReceiptKind::PipelineOssified => "genos.tracheide-pipeline-ossified/v1",
            ReceiptKind::HgtTransfer => "genos.hgt-transfer/v1",
            ReceiptKind::MissionSuccession => "genos.mission-succession/v1",
            ReceiptKind::Fossilization => "genos.fossilization/v1",
            ReceiptKind::CausalAnalysis => "genos.causal-analysis/v1",
            ReceiptKind::AeisPromotion => "genos.aeis-promotion/v1",
            ReceiptKind::CapabilityExecution => "genos.capability-execution/v1",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "genos.biological-execution-receipt/v1" => Some(ReceiptKind::BiologicalExecution),
            "genos.cell-division-receipt/v1" => Some(ReceiptKind::CellDivision),
            "genos.homeostasis-transition-receipt/v1" => Some(ReceiptKind::HomeostasisTransition),
            "genos.clinical-application/v1" => Some(ReceiptKind::ClinicalApplication),
            "genos.reproduction-event/v1" => Some(ReceiptKind::Reproduction),
            "genos.neuro-glia-quorum-response/v1" => Some(ReceiptKind::QuorumResponse),
            "genos.cnidocyte-action/v1" => Some(ReceiptKind::CnidocyteAction),
            "genos.choanocyte-stream-filtered/v1" => Some(ReceiptKind::StreamFiltered),
            "genos.iridophore-rendered/v1" => Some(ReceiptKind::PolymorphicRendered),
            "genos.guard-cell-flux-throttled/v1" => Some(ReceiptKind::FluxThrottled),
            "genos.tracheide-pipeline-ossified/v1" => Some(ReceiptKind::PipelineOssified),
            "genos.hgt-transfer/v1" => Some(ReceiptKind::HgtTransfer),
            "genos.mission-succession/v1" => Some(ReceiptKind::MissionSuccession),
            "genos.fossilization/v1" => Some(ReceiptKind::Fossilization),
            "genos.causal-analysis/v1" => Some(ReceiptKind::CausalAnalysis),
            "genos.aeis-promotion/v1" => Some(ReceiptKind::AeisPromotion),
            "genos.capability-execution/v1" => Some(ReceiptKind::CapabilityExecution),
            _ => None,
        }
    }
}

/// Receipt status
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReceiptStatus {
    Success,
    Refused,
    Failed,
    Timeout,
}

/// Authorization reference
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AuthorizationRef {
    #[serde(rename = "type")]
    pub auth_type: AuthorizationType,
    pub identifier: Option<String>,
    pub scope: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AuthorizationType {
    Lease,
    Token,
    Clinical,
    Mission,
    None,
}

/// Budget cost
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BudgetCost {
    pub amount: f64,
    pub unit: String,
    pub pool_id: Option<String>,
}

/// Provenance information
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProvenanceInfo {
    pub source: ProvenanceSource,
    pub signature: Option<String>,
    pub nonce: Option<String>,
    pub runner_id: Option<String>,
    pub environment_hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProvenanceSource {
    RustCli,
    Backend,
    Mcp,
    Orchestrator,
    Test,
}

/// Execution scope for biological receipts
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionScope {
    Organism,
    Cell,
}

/// Controller decision for homeostasis
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ControllerDecision {
    Allow,
    Deny,
    Throttle,
    Quarantine,
}