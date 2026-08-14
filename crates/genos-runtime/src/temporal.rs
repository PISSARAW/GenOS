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
}

/// Fork history at a checkpoint and replay one immutable observation stream in
/// every universe. Effects are attributed to the pair (decision, observation),
/// so factual and counterfactual explanations stay comparable.
pub fn replay_counterfactual_history(
    checkpoint: TemporalCheckpoint,
    history_end: DateTime<Utc>,
    observations: &[HistoricalObservation],
    universes: impl IntoIterator<Item = CounterfactualUniverse>,
) -> TemporalCausalReport {
    let known_history = observations
        .iter()
        .filter(|event| event.observed_at > checkpoint.replayed_at && event.observed_at <= history_end)
        .collect::<Vec<_>>();
    let results = universes
        .into_iter()
        .map(|universe| replay_universe(&known_history, universe))
        .collect();
    TemporalCausalReport { checkpoint, history_end, universes: results }
}

fn replay_universe(
    observations: &[&HistoricalObservation],
    universe: CounterfactualUniverse,
) -> TemporalUniverseResult {
    let mut result = TemporalUniverseResult {
        branch_id: universe.branch_id,
        architecture: universe.architecture,
        factual: universe.factual,
        replayed_event_ids: Vec::new(),
        p95_latency_ms: 35.0,
        consistency_risk: 0.05,
        operational_complexity: 0.20,
        causal_effects: Vec::new(),
    };
    for observation in observations {
        result.replayed_event_ids.push(observation.event_id.clone());
        apply_observation(&mut result, observation);
    }
    result.consistency_risk = result.consistency_risk.clamp(0.0, 1.0);
    result.operational_complexity = result.operational_complexity.clamp(0.0, 1.0);
    result
}

fn effect(
    result: &mut TemporalUniverseResult,
    observation: &HistoricalObservation,
    metric: &str,
    delta: f64,
    explanation: &str,
) {
    result.causal_effects.push(CausalEffect {
        decision: result.architecture.clone(),
        triggering_event_id: observation.event_id.clone(),
        metric: metric.to_string(),
        delta,
        explanation: explanation.to_string(),
    });
    match metric {
        "p95_latency_ms" => result.p95_latency_ms += delta,
        "consistency_risk" => result.consistency_risk += delta,
        "operational_complexity" => result.operational_complexity += delta,
        _ => {}
    }
}

fn apply_observation(result: &mut TemporalUniverseResult, observation: &HistoricalObservation) {
    use ArchitectureDecision::*;
    use HistoricalObservationKind::*;
    match (&result.architecture, &observation.kind) {
        (PostgresRedis, TrafficGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 12.0 * multiplier, "cache misses amplify database read pressure"),
        (PostgresOnly, TrafficGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 18.0 * multiplier, "all reads reach the primary database"),
        (CockroachDb, TrafficGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 8.0 * multiplier, "distributed reads absorb traffic with consensus overhead"),
        (EventSourcing, TrafficGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 6.0 * multiplier, "read projections isolate query traffic"),
        (DifferentDataModel, TrafficGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 4.0 * multiplier, "access-pattern-oriented records reduce joins"),

        (PostgresRedis, DatasetGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 16.0 * multiplier, "larger joins and cache churn increase tail latency"),
        (PostgresOnly, DatasetGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 20.0 * multiplier, "the normalized model becomes the query bottleneck"),
        (CockroachDb, DatasetGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 9.0 * multiplier, "data distribution helps capacity but adds coordination"),
        (EventSourcing, DatasetGrowth { multiplier }) => effect(result, observation, "operational_complexity", 0.08 * multiplier, "projection rebuilds grow with event volume"),
        (DifferentDataModel, DatasetGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 3.0 * multiplier, "denormalized aggregates scale with the known access pattern"),

        (PostgresRedis, WriteGrowth { multiplier }) => {
            effect(result, observation, "p95_latency_ms", 11.0 * multiplier, "writes invalidate hot cache entries");
            effect(result, observation, "consistency_risk", 0.07 * multiplier, "database and cache updates are not one transaction");
        }
        (PostgresOnly, WriteGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 14.0 * multiplier, "write contention reaches the primary directly"),
        (CockroachDb, WriteGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 8.0 * multiplier, "consensus increases write latency"),
        (EventSourcing, WriteGrowth { multiplier }) => effect(result, observation, "operational_complexity", 0.05 * multiplier, "event ordering and projections require supervision"),
        (DifferentDataModel, WriteGrowth { multiplier }) => effect(result, observation, "p95_latency_ms", 5.0 * multiplier, "partitioned aggregates reduce contention"),

        (PostgresRedis, CrossRegionTraffic { regions }) => effect(result, observation, "consistency_risk", 0.08 * *regions as f64, "regional caches diverge under invalidation lag"),
        (PostgresOnly, CrossRegionTraffic { regions }) => effect(result, observation, "p95_latency_ms", 13.0 * *regions as f64, "all regions call one primary"),
        (CockroachDb, CrossRegionTraffic { regions }) => effect(result, observation, "p95_latency_ms", 3.0 * *regions as f64, "geo-distribution keeps reads close while coordinating writes"),
        (EventSourcing, CrossRegionTraffic { regions }) => effect(result, observation, "operational_complexity", 0.04 * *regions as f64, "global event ordering needs explicit semantics"),
        (DifferentDataModel, CrossRegionTraffic { regions }) => effect(result, observation, "p95_latency_ms", 5.0 * *regions as f64, "regional replicas still reconcile aggregate ownership"),

        (PostgresRedis, CacheInvalidationSpike { invalidations_per_second }) => {
            let scale = *invalidations_per_second as f64 / 1000.0;
            effect(result, observation, "p95_latency_ms", 22.0 * scale, "invalidation storms collapse the cache hit rate");
            effect(result, observation, "consistency_risk", 0.12 * scale, "stale values remain visible during the storm");
        }
        (PostgresOnly, CacheInvalidationSpike { .. }) => effect(result, observation, "operational_complexity", -0.02, "no cache invalidation subsystem exists"),
        (CockroachDb, CacheInvalidationSpike { .. }) => effect(result, observation, "operational_complexity", 0.02, "the event is mostly irrelevant but distributed operations remain"),
        (EventSourcing, CacheInvalidationSpike { .. }) => effect(result, observation, "operational_complexity", 0.03, "projection freshness replaces cache freshness as the concern"),
        (DifferentDataModel, CacheInvalidationSpike { .. }) => effect(result, observation, "p95_latency_ms", 1.0, "materialized aggregates avoid the invalidation path"),
    }
}
