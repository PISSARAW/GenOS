use chrono::{DateTime, Utc};
use genos_core::BranchId;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArchitectureDecision {
    PostgresRedis,
    PostgresOnly,
    CockroachDb,
    EventSourcing,
    DifferentDataModel,
}

impl ArchitectureDecision {
    pub fn label(&self) -> &'static str {
        match self {
            Self::PostgresRedis => "Postgres + Redis",
            Self::PostgresOnly => "Postgres only",
            Self::CockroachDb => "CockroachDB",
            Self::EventSourcing => "Event sourcing",
            Self::DifferentDataModel => "Different data model",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum HistoricalObservationKind {
    TrafficGrowth { multiplier: f64 },
    DatasetGrowth { multiplier: f64 },
    WriteGrowth { multiplier: f64 },
    CrossRegionTraffic { regions: u32 },
    CacheInvalidationSpike { invalidations_per_second: u64 },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HistoricalObservation {
    pub event_id: String,
    pub observed_at: DateTime<Utc>,
    #[serde(flatten)]
    pub kind: HistoricalObservationKind,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TemporalCheckpoint {
    pub agent_ref: String,
    pub replayed_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CounterfactualUniverse {
    pub branch_id: BranchId,
    pub hypothesis: String,
    pub architecture: ArchitectureDecision,
    pub factual: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalEffect {
    pub decision: ArchitectureDecision,
    pub triggering_event_id: String,
    pub metric: String,
    pub delta: f64,
    pub explanation: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TemporalUniverseResult {
    pub branch_id: BranchId,
    pub architecture: ArchitectureDecision,
    pub factual: bool,
    pub replayed_event_ids: Vec<String>,
    pub p95_latency_ms: f64,
    pub consistency_risk: f64,
    pub operational_complexity: f64,
    pub causal_effects: Vec<CausalEffect>,
}

impl TemporalUniverseResult {
    pub fn explain_metric(&self, metric: &str) -> Vec<&CausalEffect> {
        self.causal_effects
            .iter()
            .filter(|effect| effect.metric == metric)
            .collect()
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TemporalCausalReport {
    pub checkpoint: TemporalCheckpoint,
    pub history_end: DateTime<Utc>,
    pub universes: Vec<TemporalUniverseResult>,
    pub primitive_trace: crate::AgentPrimitiveTrace,
}
