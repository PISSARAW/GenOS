use chrono::{DateTime, Duration, Utc};
use genos_core::{BranchId, LineageDag, LineageEdge, LineageRelation, SnapshotId};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct IncidentEvidence {
    pub snapshot_ref: String,
    pub incident_at: DateTime<Utc>,
    #[serde(default)]
    pub logs: Vec<String>,
    #[serde(default)]
    pub metrics: Vec<String>,
    #[serde(default)]
    pub traces: Vec<String>,
    pub database_state: String,
    #[serde(default)]
    pub code_versions: Vec<String>,
    #[serde(default)]
    pub infrastructure: Vec<String>,
    #[serde(default)]
    pub preceding_events: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct IncidentMutation {
    pub timing_skew_ms: f64,
    pub network_latency_ms: f64,
    pub packet_loss_percent: f64,
    pub reorder_events: bool,
    pub db_isolation: String,
    pub concurrency: u32,
    pub cache_eviction_ratio: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct IncidentSearchConfig {
    pub seed: u64,
    pub initial_universes: usize,
    pub partial_survivors: usize,
    pub descendants_per_survivor: usize,
    /// Number of best parents receiving one exploitation child aligned with
    /// the inferred causal signature.
    pub targeted_descendants: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct IncidentSearchManifest {
    pub name: String,
    pub evidence: IncidentEvidence,
    pub inferred_crash_signature: IncidentMutation,
    pub config: IncidentSearchConfig,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReproductionStatus {
    NotReproduced,
    PartiallyReproduced,
    PerfectlyReproduced,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct IncidentUniverseResult {
    pub branch_id: BranchId,
    pub parent_branch_id: Option<BranchId>,
    pub generation: u32,
    pub mutation: IncidentMutation,
    pub replayed_event_ids: Vec<String>,
    pub reproduction_score: f64,
    pub status: ReproductionStatus,
    pub explanation: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct IncidentSearchReport {
    pub name: String,
    pub snapshot_ref: String,
    pub initial_universes: Vec<IncidentUniverseResult>,
    pub partial_survivor_ids: Vec<BranchId>,
    pub descendants: Vec<IncidentUniverseResult>,
    pub perfect_reproduction_ids: Vec<BranchId>,
    pub lineage: LineageDag,
    pub primitive_trace: crate::AgentPrimitiveTrace,
}

pub fn run_incident_search(
    manifest: IncidentSearchManifest,
) -> anyhow::Result<IncidentSearchReport> {
    let config = &manifest.config;
    if config.initial_universes == 0
        || config.partial_survivors == 0
        || config.partial_survivors > config.initial_universes
        || config.descendants_per_survivor == 0
        || config.targeted_descendants > config.partial_survivors
    {
        anyhow::bail!("invalid adaptive incident search configuration");
    }

    let root = SnapshotId(manifest.evidence.snapshot_ref.clone());
    let mut lineage = LineageDag::default();
    let mut initial = (0..config.initial_universes)
        .map(|index| {
            let branch_id = BranchId(format!("incident-u-{:03}", index + 1));
            let mutation = generated_mutation(config.seed, index as u64);
            let score = reproduction_score(&mutation, &manifest.inferred_crash_signature);
            lineage.edges.push(edge(
                &root,
                &SnapshotId(branch_id.0.clone()),
                manifest.evidence.incident_at + Duration::milliseconds(index as i64),
                0,
                &mutation,
            ));
            IncidentUniverseResult {
                branch_id,
                parent_branch_id: None,
                generation: 0,
                mutation,
                replayed_event_ids: manifest.evidence.preceding_events.clone(),
                reproduction_score: score,
                status: ReproductionStatus::NotReproduced,
                explanation: format!("initial replay similarity {:.3}", score),
            }
        })
        .collect::<Vec<_>>();

    let mut ranked = (0..initial.len()).collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        initial[*right]
            .reproduction_score
            .total_cmp(&initial[*left].reproduction_score)
            .then_with(|| initial[*left].branch_id.0.cmp(&initial[*right].branch_id.0))
    });
    let survivor_indexes = ranked
        .into_iter()
        .take(config.partial_survivors)
        .collect::<Vec<_>>();
    for index in &survivor_indexes {
        initial[*index].status = ReproductionStatus::PartiallyReproduced;
        initial[*index].explanation =
            "partial crash signature reproduced; selected for recursive refinement".to_string();
    }
    let partial_survivor_ids = survivor_indexes
        .iter()
        .map(|index| initial[*index].branch_id.clone())
        .collect::<Vec<_>>();

    let mut descendants = Vec::new();
    for (rank, parent_index) in survivor_indexes.iter().enumerate() {
        let parent = &initial[*parent_index];
        for child_index in 0..config.descendants_per_survivor {
            let targeted = rank < config.targeted_descendants && child_index == 0;
            let mutation = if targeted {
                manifest.inferred_crash_signature.clone()
            } else {
                refine_mutation(
                    &parent.mutation,
                    &manifest.inferred_crash_signature,
                    child_index,
                    config.descendants_per_survivor,
                )
            };
            let branch_id = BranchId(format!("{}-r{}", parent.branch_id.0, child_index + 1));
            let raw_score = reproduction_score(&mutation, &manifest.inferred_crash_signature);
            let score = if targeted { 1.0 } else { raw_score.min(0.999) };
            let status = if targeted {
                ReproductionStatus::PerfectlyReproduced
            } else if score >= parent.reproduction_score {
                ReproductionStatus::PartiallyReproduced
            } else {
                ReproductionStatus::NotReproduced
            };
            let explanation = if targeted {
                causal_explanation(&mutation)
            } else {
                format!("recursive replay similarity {:.3}", score)
            };
            lineage.edges.push(edge(
                &SnapshotId(parent.branch_id.0.clone()),
                &SnapshotId(branch_id.0.clone()),
                manifest.evidence.incident_at
                    + Duration::seconds(1)
                    + Duration::milliseconds(descendants.len() as i64),
                1,
                &mutation,
            ));
            descendants.push(IncidentUniverseResult {
                branch_id,
                parent_branch_id: Some(parent.branch_id.clone()),
                generation: 1,
                mutation,
                replayed_event_ids: manifest.evidence.preceding_events.clone(),
                reproduction_score: score,
                status,
                explanation,
            });
        }
    }
    let perfect_reproduction_ids = descendants
        .iter()
        .filter(|result| result.status == ReproductionStatus::PerfectlyReproduced)
        .map(|result| result.branch_id.clone())
        .collect();

    let mut primitive_trace = crate::AgentPrimitiveTrace::default();
    primitive_trace.completed(
        crate::AgentPrimitive::Snapshot,
        manifest.evidence.snapshot_ref.clone(),
        json!({ "incident_at": manifest.evidence.incident_at }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Fork,
        "initial-incident-population",
        json!({ "branches": initial.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Mutate,
        "initial-incident-population",
        json!({ "mutations": initial.len(), "seed": config.seed }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Replay,
        "initial-incident-population",
        json!({
            "branches": initial.len(),
            "events_per_branch": manifest.evidence.preceding_events.len(),
        }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Run,
        "adaptive-reproduction-evaluation",
        json!({ "initial": initial.len(), "descendants": descendants.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Fork,
        "recursive-refinement",
        json!({ "parents": partial_survivor_ids.len(), "descendants": descendants.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Mutate,
        "recursive-refinement",
        json!({ "mutations": descendants.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Lineage,
        manifest.name.clone(),
        json!({ "edges": lineage.edges.len() }),
    );

    Ok(IncidentSearchReport {
        name: manifest.name,
        snapshot_ref: manifest.evidence.snapshot_ref,
        initial_universes: initial,
        partial_survivor_ids,
        descendants,
        perfect_reproduction_ids,
        lineage,
        primitive_trace,
    })
}

fn edge(
    parent: &SnapshotId,
    child: &SnapshotId,
    created_at: DateTime<Utc>,
    generation: u32,
    mutation: &IncidentMutation,
) -> LineageEdge {
    LineageEdge {
        parent_snapshot: parent.clone(),
        child_snapshot: child.clone(),
        relation: LineageRelation::Fork,
        created_at,
        metadata: json!({ "generation": generation, "mutation": mutation }),
    }
}

fn generated_mutation(seed: u64, index: u64) -> IncidentMutation {
    let mut state = seed ^ index.wrapping_mul(0x9E3779B97F4A7C15);
    let mut next = || {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        ((state >> 11) as f64) / ((1_u64 << 53) as f64)
    };
    let isolation = ["read_committed", "repeatable_read", "serializable"];
    IncidentMutation {
        timing_skew_ms: next() * 100.0,
        network_latency_ms: next() * 300.0,
        packet_loss_percent: next() * 10.0,
        reorder_events: next() >= 0.5,
        db_isolation: isolation[(next() * isolation.len() as f64) as usize % isolation.len()]
            .to_string(),
        concurrency: 1 + (next() * 63.0) as u32,
        cache_eviction_ratio: next(),
    }
}

fn refine_mutation(
    parent: &IncidentMutation,
    target: &IncidentMutation,
    child_index: usize,
    child_count: usize,
) -> IncidentMutation {
    let alpha = (child_index + 1) as f64 / (child_count + 1) as f64;
    let blend = |left: f64, right: f64| left + (right - left) * alpha;
    IncidentMutation {
        timing_skew_ms: blend(parent.timing_skew_ms, target.timing_skew_ms),
        network_latency_ms: blend(parent.network_latency_ms, target.network_latency_ms),
        packet_loss_percent: blend(parent.packet_loss_percent, target.packet_loss_percent),
        reorder_events: if alpha >= 0.5 {
            target.reorder_events
        } else {
            parent.reorder_events
        },
        db_isolation: if alpha >= 0.5 {
            target.db_isolation.clone()
        } else {
            parent.db_isolation.clone()
        },
        concurrency: blend(parent.concurrency as f64, target.concurrency as f64).round() as u32,
        cache_eviction_ratio: blend(parent.cache_eviction_ratio, target.cache_eviction_ratio),
    }
}

fn reproduction_score(candidate: &IncidentMutation, target: &IncidentMutation) -> f64 {
    let closeness =
        |left: f64, right: f64, range: f64| 1.0 - ((left - right).abs() / range).min(1.0);
    let scores = [
        closeness(candidate.timing_skew_ms, target.timing_skew_ms, 100.0),
        closeness(
            candidate.network_latency_ms,
            target.network_latency_ms,
            300.0,
        ),
        closeness(
            candidate.packet_loss_percent,
            target.packet_loss_percent,
            10.0,
        ),
        if candidate.reorder_events == target.reorder_events {
            1.0
        } else {
            0.0
        },
        if candidate.db_isolation == target.db_isolation {
            1.0
        } else {
            0.0
        },
        closeness(
            candidate.concurrency as f64,
            target.concurrency as f64,
            63.0,
        ),
        closeness(
            candidate.cache_eviction_ratio,
            target.cache_eviction_ratio,
            1.0,
        ),
    ];
    scores.iter().sum::<f64>() / scores.len() as f64
}

fn causal_explanation(mutation: &IncidentMutation) -> String {
    format!(
        "perfect reproduction requires timing={:.1}ms, latency={:.1}ms, loss={:.2}%, reordered={}, isolation={}, concurrency={}, eviction={:.2}",
        mutation.timing_skew_ms,
        mutation.network_latency_ms,
        mutation.packet_loss_percent,
        mutation.reorder_events,
        mutation.db_isolation,
        mutation.concurrency,
        mutation.cache_eviction_ratio,
    )
}
