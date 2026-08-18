use super::*;
use chrono::{DateTime, TimeZone, Utc};
use serde_json::{json, Value};
use std::collections::BTreeMap;

fn at(month: u32, day: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, month, day, 0, 0, 0).unwrap()
}

fn predicate(key: &str, value: Value) -> StatePredicate {
    StatePredicate {
        key: key.to_string(),
        operation: PredicateOperation::Equals,
        value,
    }
}

fn effect(
    key: &str,
    operation: EffectOperation,
    value: Value,
    when: Vec<StatePredicate>,
) -> CausalStateEffect {
    CausalStateEffect {
        key: key.to_string(),
        operation,
        value,
        when,
    }
}

fn event(
    id: &str,
    date: DateTime<Utc>,
    kind: CausalEventKind,
    effects: Vec<CausalStateEffect>,
) -> CausalTimelineEvent {
    CausalTimelineEvent {
        event_id: id.to_string(),
        occurred_at: date,
        kind,
        description: id.to_string(),
        depends_on: vec![],
        preconditions: vec![],
        effects,
    }
}

#[test]
fn changing_march_decision_replays_shared_events_into_a_divergent_present() {
    let checkpoint = CausalCheckpoint {
        agent_ref: "agent@2026-03-14".to_string(),
        at: at(3, 14),
        state: BTreeMap::from([
            ("latency_ms".to_string(), json!(100.0)),
            ("consistency_risk".to_string(), json!(0.1)),
        ]),
    };
    let events = vec![
        event(
            "decision-X",
            at(3, 15),
            CausalEventKind::Decision,
            vec![effect(
                "architecture",
                EffectOperation::Set,
                json!("redis"),
                vec![],
            )],
        ),
        event(
            "april-traffic",
            at(4, 10),
            CausalEventKind::Observation,
            vec![effect(
                "latency_ms",
                EffectOperation::Add,
                json!(20.0),
                vec![],
            )],
        ),
        CausalTimelineEvent {
            event_id: "may-cache-incident".to_string(),
            occurred_at: at(5, 8),
            kind: CausalEventKind::Outcome,
            description: "cache invalidation incident".to_string(),
            depends_on: vec!["decision-X".to_string()],
            preconditions: vec![predicate("architecture", json!("redis"))],
            effects: vec![effect(
                "consistency_risk",
                EffectOperation::Add,
                json!(0.5),
                vec![],
            )],
        },
        event(
            "august-contention",
            at(8, 1),
            CausalEventKind::Observation,
            vec![
                effect(
                    "latency_ms",
                    EffectOperation::Add,
                    json!(50.0),
                    vec![predicate("architecture", json!("redis"))],
                ),
                effect(
                    "latency_ms",
                    EffectOperation::Add,
                    json!(15.0),
                    vec![predicate("architecture", json!("postgres"))],
                ),
            ],
        ),
    ];
    let intervention = DecisionIntervention {
        target_event_id: "decision-X".to_string(),
        replacement: event(
            "decision-Y",
            at(3, 15),
            CausalEventKind::Decision,
            vec![effect(
                "architecture",
                EffectOperation::Set,
                json!("postgres"),
                vec![],
            )],
        ),
    };
    let report =
        replay_personal_counterfactual(checkpoint, at(8, 31), &events, &intervention).unwrap();
    assert_eq!(report.reality.final_state["latency_ms"], json!(170.0));
    assert_eq!(
        report.counterfactual.final_state["latency_ms"],
        json!(135.0)
    );
    assert_eq!(
        report.comparison.incompatible_events,
        vec!["may-cache-incident"]
    );
    assert!(report
        .comparison
        .downstream_effects
        .contains(&"latency_ms".to_string()));
    assert!(!report
        .comparison
        .common_replayed_events
        .contains(&"decision-X".to_string()));
}

#[test]
fn dependencies_must_point_into_the_past() {
    let checkpoint = CausalCheckpoint {
        agent_ref: "agent@march".to_string(),
        at: at(3, 1),
        state: BTreeMap::new(),
    };
    let mut decision = event("X", at(3, 2), CausalEventKind::Decision, vec![]);
    decision.depends_on = vec!["future".to_string()];
    let future = event("future", at(4, 1), CausalEventKind::Observation, vec![]);
    let intervention = DecisionIntervention {
        target_event_id: "X".to_string(),
        replacement: event("Y", at(3, 2), CausalEventKind::Decision, vec![]),
    };
    assert!(replay_personal_counterfactual(
        checkpoint,
        at(8, 1),
        &[decision, future],
        &intervention
    )
    .is_err());
}
