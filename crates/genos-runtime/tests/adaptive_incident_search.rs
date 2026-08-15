use chrono::{DateTime, Utc};
use genos_runtime::{
    run_incident_search, AgentPrimitive, IncidentEvidence, IncidentMutation, IncidentSearchConfig,
    IncidentSearchManifest, ReproductionStatus,
};

fn at(value: &str) -> DateTime<Utc> {
    value.parse().unwrap()
}

#[test]
fn adaptive_search_refines_partial_reproductions_into_three_perfect_matches() {
    let report = run_incident_search(IncidentSearchManifest {
        name: "incident-42".to_string(),
        evidence: IncidentEvidence {
            snapshot_ref: "production@incident-42".to_string(),
            incident_at: at("2026-08-14T02:17:00Z"),
            logs: vec!["worker stalled before commit".to_string()],
            metrics: vec!["p99 latency spike".to_string()],
            traces: vec!["request→cache→db→timeout".to_string()],
            database_state: "sha256:db-state-42".to_string(),
            code_versions: vec!["api@a91e".to_string(), "worker@18bc".to_string()],
            infrastructure: vec!["prod-eu-west".to_string()],
            preceding_events: vec![
                "evt-901".to_string(),
                "evt-902".to_string(),
                "evt-903".to_string(),
            ],
        },
        inferred_crash_signature: IncidentMutation {
            timing_skew_ms: 73.0,
            network_latency_ms: 180.0,
            packet_loss_percent: 2.5,
            reorder_events: true,
            db_isolation: "serializable".to_string(),
            concurrency: 48,
            cache_eviction_ratio: 0.82,
        },
        config: IncidentSearchConfig {
            seed: 42,
            initial_universes: 100,
            partial_survivors: 11,
            descendants_per_survivor: 4,
            targeted_descendants: 3,
        },
    })
    .expect("incident search failed");

    assert_eq!(report.initial_universes.len(), 100);
    assert_eq!(report.partial_survivor_ids.len(), 11);
    assert_eq!(report.descendants.len(), 44);
    assert_eq!(report.perfect_reproduction_ids.len(), 3);
    assert_eq!(report.lineage.edges.len(), 144);
    assert!(report
        .descendants
        .iter()
        .filter(|result| { result.status == ReproductionStatus::PerfectlyReproduced })
        .all(|result| result.reproduction_score == 1.0));
    assert!(report
        .initial_universes
        .iter()
        .chain(&report.descendants)
        .all(|result| { result.replayed_event_ids == vec!["evt-901", "evt-902", "evt-903"] }));
    assert!(report.primitive_trace.contains(AgentPrimitive::Snapshot));
    assert_eq!(report.primitive_trace.count(AgentPrimitive::Fork), 2);
    assert!(report.primitive_trace.contains(AgentPrimitive::Mutate));
    assert!(report.primitive_trace.contains(AgentPrimitive::Replay));
}
