use chrono::{DateTime, Utc};
use genos_core::BranchId;
use genos_runtime::{
    replay_counterfactual_history, AgentPrimitive, ArchitectureDecision, CounterfactualUniverse,
    HistoricalObservation, HistoricalObservationKind, TemporalCheckpoint,
};

fn at(value: &str) -> DateTime<Utc> {
    value.parse().expect("valid RFC3339 timestamp")
}

#[test]
fn rewriting_a_past_decision_replays_shared_history_with_causal_explanations() {
    let checkpoint = TemporalCheckpoint {
        agent_ref: "agent@2026-03-12".to_string(),
        replayed_at: at("2026-03-12T00:00:00Z"),
    };
    let observations = vec![
        HistoricalObservation {
            event_id: "april-traffic".to_string(),
            observed_at: at("2026-04-10T00:00:00Z"),
            kind: HistoricalObservationKind::TrafficGrowth { multiplier: 1.8 },
        },
        HistoricalObservation {
            event_id: "june-dataset".to_string(),
            observed_at: at("2026-06-03T00:00:00Z"),
            kind: HistoricalObservationKind::DatasetGrowth { multiplier: 2.2 },
        },
        HistoricalObservation {
            event_id: "july-writes".to_string(),
            observed_at: at("2026-07-08T00:00:00Z"),
            kind: HistoricalObservationKind::WriteGrowth { multiplier: 2.0 },
        },
        HistoricalObservation {
            event_id: "august-regions".to_string(),
            observed_at: at("2026-08-02T00:00:00Z"),
            kind: HistoricalObservationKind::CrossRegionTraffic { regions: 3 },
        },
        HistoricalObservation {
            event_id: "august-invalidation-storm".to_string(),
            observed_at: at("2026-08-17T00:00:00Z"),
            kind: HistoricalObservationKind::CacheInvalidationSpike {
                invalidations_per_second: 1500,
            },
        },
    ];
    let universes = vec![
        CounterfactualUniverse {
            branch_id: BranchId("reality".to_string()),
            hypothesis: "historical decision".to_string(),
            architecture: ArchitectureDecision::PostgresRedis,
            factual: true,
        },
        CounterfactualUniverse {
            branch_id: BranchId("counterfactual-A".to_string()),
            hypothesis: "remove cache coordination".to_string(),
            architecture: ArchitectureDecision::PostgresOnly,
            factual: false,
        },
        CounterfactualUniverse {
            branch_id: BranchId("counterfactual-B".to_string()),
            hypothesis: "distribute SQL storage".to_string(),
            architecture: ArchitectureDecision::CockroachDb,
            factual: false,
        },
        CounterfactualUniverse {
            branch_id: BranchId("counterfactual-C".to_string()),
            hypothesis: "model changes as events".to_string(),
            architecture: ArchitectureDecision::EventSourcing,
            factual: false,
        },
        CounterfactualUniverse {
            branch_id: BranchId("counterfactual-D".to_string()),
            hypothesis: "change access patterns before infrastructure".to_string(),
            architecture: ArchitectureDecision::DifferentDataModel,
            factual: false,
        },
    ];

    let report = replay_counterfactual_history(
        checkpoint,
        at("2026-08-31T23:59:59Z"),
        &observations,
        universes,
    );

    assert_eq!(report.universes.len(), 5);
    let shared_history = &report.universes[0].replayed_event_ids;
    assert_eq!(shared_history.len(), 5);
    assert!(report
        .universes
        .iter()
        .all(|universe| universe.replayed_event_ids == *shared_history));

    let reality = report
        .universes
        .iter()
        .find(|universe| universe.factual)
        .unwrap();
    assert!(reality.p95_latency_ms > 140.0);
    assert!(reality.consistency_risk > 0.5);
    let latency_causes = reality.explain_metric("p95_latency_ms");
    assert!(latency_causes.iter().any(|effect| {
        effect.triggering_event_id == "august-invalidation-storm"
            && effect.decision == ArchitectureDecision::PostgresRedis
    }));

    let changed_model = report
        .universes
        .iter()
        .find(|universe| universe.architecture == ArchitectureDecision::DifferentDataModel)
        .unwrap();
    assert!(changed_model.p95_latency_ms < reality.p95_latency_ms);

    println!(
        "replay {} → {} known events",
        report.checkpoint.agent_ref,
        shared_history.len()
    );
    for universe in &report.universes {
        println!(
            "{} architecture={} latency={:.1}ms consistency_risk={:.2} ops={:.2}",
            universe.branch_id,
            universe.architecture.label(),
            universe.p95_latency_ms,
            universe.consistency_risk,
            universe.operational_complexity,
        );
    }
    for cause in latency_causes {
        println!(
            "why reality latency changed: decision={} event={} delta={:+.1} — {}",
            cause.decision.label(),
            cause.triggering_event_id,
            cause.delta,
            cause.explanation,
        );
    }
    assert!(report.primitive_trace.contains(AgentPrimitive::Restore));
    assert_eq!(report.primitive_trace.count(AgentPrimitive::Replay), 5);
    assert!(report.primitive_trace.contains(AgentPrimitive::Diff));
}
