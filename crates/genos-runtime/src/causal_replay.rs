use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};

pub type CausalState = BTreeMap<String, Value>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalCheckpoint {
    pub agent_ref: String,
    pub at: DateTime<Utc>,
    pub state: CausalState,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CausalEventKind {
    Decision,
    Observation,
    Action,
    Outcome,
    External,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PredicateOperation {
    Equals,
    NotEquals,
    GreaterThan,
    GreaterOrEqual,
    LessThan,
    LessOrEqual,
    Exists,
    Missing,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StatePredicate {
    pub key: String,
    pub operation: PredicateOperation,
    #[serde(default)]
    pub value: Value,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectOperation {
    Set,
    Add,
    Multiply,
    Remove,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalStateEffect {
    pub key: String,
    pub operation: EffectOperation,
    #[serde(default)]
    pub value: Value,
    #[serde(default)]
    pub when: Vec<StatePredicate>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalTimelineEvent {
    pub event_id: String,
    pub occurred_at: DateTime<Utc>,
    pub kind: CausalEventKind,
    pub description: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub preconditions: Vec<StatePredicate>,
    #[serde(default)]
    pub effects: Vec<CausalStateEffect>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DecisionIntervention {
    pub target_event_id: String,
    pub replacement: CausalTimelineEvent,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplayEventStatus {
    Applied,
    Replaced,
    Skipped,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StateChange {
    pub key: String,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReplayedCausalEvent {
    pub source_event_id: String,
    pub effective_event_id: String,
    pub occurred_at: DateTime<Utc>,
    pub status: ReplayEventStatus,
    pub description: String,
    pub state_changes: Vec<StateChange>,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalTimelineResult {
    pub label: String,
    pub final_state: CausalState,
    pub events: Vec<ReplayedCausalEvent>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalStateDelta {
    pub key: String,
    pub reality: Option<Value>,
    pub counterfactual: Option<Value>,
    pub numeric_delta: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalReplayComparison {
    pub decision_changed_from: String,
    pub decision_changed_to: String,
    pub state_deltas: Vec<CausalStateDelta>,
    pub direct_effects: Vec<String>,
    pub downstream_effects: Vec<String>,
    pub incompatible_events: Vec<String>,
    pub common_replayed_events: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PersonalCausalReplayReport {
    pub checkpoint: CausalCheckpoint,
    pub history_end: DateTime<Utc>,
    pub reality: CausalTimelineResult,
    pub counterfactual: CausalTimelineResult,
    pub comparison: CausalReplayComparison,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PersonalCausalReplayManifest {
    pub name: String,
    pub checkpoint: CausalCheckpoint,
    pub history_end: DateTime<Utc>,
    pub events: Vec<CausalTimelineEvent>,
    pub intervention: DecisionIntervention,
}

pub fn run_personal_causal_replay(
    manifest: PersonalCausalReplayManifest,
) -> Result<PersonalCausalReplayReport, String> {
    replay_personal_counterfactual(
        manifest.checkpoint,
        manifest.history_end,
        &manifest.events,
        &manifest.intervention,
    )
}

pub fn replay_personal_counterfactual(
    checkpoint: CausalCheckpoint,
    history_end: DateTime<Utc>,
    events: &[CausalTimelineEvent],
    intervention: &DecisionIntervention,
) -> Result<PersonalCausalReplayReport, String> {
    let history = validate_and_order(&checkpoint, history_end, events, intervention)?;
    let reality = replay("reality", &checkpoint.state, &history, None)?;
    let counterfactual = replay(
        "counterfactual",
        &checkpoint.state,
        &history,
        Some(intervention),
    )?;
    let comparison = compare_timelines(&reality, &counterfactual, intervention);
    Ok(PersonalCausalReplayReport {
        checkpoint,
        history_end,
        reality,
        counterfactual,
        comparison,
    })
}

fn validate_and_order<'a>(
    checkpoint: &CausalCheckpoint,
    history_end: DateTime<Utc>,
    events: &'a [CausalTimelineEvent],
    intervention: &DecisionIntervention,
) -> Result<Vec<&'a CausalTimelineEvent>, String> {
    if history_end <= checkpoint.at {
        return Err("history end must be after the checkpoint".to_string());
    }
    let mut ids = HashSet::new();
    for event in events {
        if event.event_id.is_empty() || !ids.insert(event.event_id.clone()) {
            return Err("timeline event ids must be non-empty and unique".to_string());
        }
        if event.occurred_at <= checkpoint.at || event.occurred_at > history_end {
            return Err(format!(
                "event {} falls outside the replay window",
                event.event_id
            ));
        }
    }
    let target = events
        .iter()
        .find(|event| event.event_id == intervention.target_event_id)
        .ok_or_else(|| "intervention target is absent from history".to_string())?;
    if target.kind != CausalEventKind::Decision
        || intervention.replacement.kind != CausalEventKind::Decision
        || intervention.replacement.occurred_at != target.occurred_at
        || ids.contains(&intervention.replacement.event_id)
    {
        return Err(
            "replacement must be a new decision at the target decision timestamp".to_string(),
        );
    }
    let mut ordered = events.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| {
        left.occurred_at
            .cmp(&right.occurred_at)
            .then_with(|| left.event_id.cmp(&right.event_id))
    });
    let positions = ordered
        .iter()
        .enumerate()
        .map(|(index, event)| (event.event_id.as_str(), index))
        .collect::<HashMap<_, _>>();
    for (index, event) in ordered.iter().enumerate() {
        for dependency in &event.depends_on {
            let Some(position) = positions.get(dependency.as_str()) else {
                return Err(format!(
                    "event {} depends on unknown event {}",
                    event.event_id, dependency
                ));
            };
            if *position >= index {
                return Err(format!(
                    "event {} dependency {} is not in its past",
                    event.event_id, dependency
                ));
            }
        }
    }
    let target_position = positions[intervention.target_event_id.as_str()];
    for dependency in &intervention.replacement.depends_on {
        let Some(position) = positions.get(dependency.as_str()) else {
            return Err(format!(
                "replacement decision depends on unknown event {dependency}"
            ));
        };
        if *position >= target_position {
            return Err(format!(
                "replacement dependency {dependency} is not before the intervention"
            ));
        }
    }
    Ok(ordered)
}

fn replay(
    label: &str,
    initial_state: &CausalState,
    events: &[&CausalTimelineEvent],
    intervention: Option<&DecisionIntervention>,
) -> Result<CausalTimelineResult, String> {
    let mut state = initial_state.clone();
    let mut processed = HashSet::new();
    let mut replayed = Vec::new();
    for source in events {
        let replacement = intervention
            .filter(|intervention| intervention.target_event_id == source.event_id)
            .map(|intervention| &intervention.replacement);
        let effective = replacement.unwrap_or(source);
        let missing_dependencies = effective
            .depends_on
            .iter()
            .filter(|dependency| !processed.contains(*dependency))
            .cloned()
            .collect::<Vec<_>>();
        let failed_preconditions = effective
            .preconditions
            .iter()
            .filter(|predicate| !predicate_matches(&state, predicate))
            .map(|predicate| predicate.key.clone())
            .collect::<Vec<_>>();
        if !missing_dependencies.is_empty() || !failed_preconditions.is_empty() {
            replayed.push(ReplayedCausalEvent {
                source_event_id: source.event_id.clone(),
                effective_event_id: effective.event_id.clone(),
                occurred_at: effective.occurred_at,
                status: ReplayEventStatus::Skipped,
                description: effective.description.clone(),
                state_changes: vec![],
                reason: Some(format!(
                    "missing_dependencies={missing_dependencies:?}; failed_preconditions={failed_preconditions:?}"
                )),
            });
            continue;
        }
        let mut changes = Vec::new();
        for effect in &effective.effects {
            if effect
                .when
                .iter()
                .all(|predicate| predicate_matches(&state, predicate))
            {
                changes.push(apply_effect(&mut state, effect)?);
            }
        }
        processed.insert(source.event_id.clone());
        processed.insert(effective.event_id.clone());
        replayed.push(ReplayedCausalEvent {
            source_event_id: source.event_id.clone(),
            effective_event_id: effective.event_id.clone(),
            occurred_at: effective.occurred_at,
            status: if replacement.is_some() {
                ReplayEventStatus::Replaced
            } else {
                ReplayEventStatus::Applied
            },
            description: effective.description.clone(),
            state_changes: changes,
            reason: None,
        });
    }
    Ok(CausalTimelineResult {
        label: label.to_string(),
        final_state: state,
        events: replayed,
    })
}

fn predicate_matches(state: &CausalState, predicate: &StatePredicate) -> bool {
    let current = state.get(&predicate.key);
    match predicate.operation {
        PredicateOperation::Exists => current.is_some(),
        PredicateOperation::Missing => current.is_none(),
        PredicateOperation::Equals => current == Some(&predicate.value),
        PredicateOperation::NotEquals => current != Some(&predicate.value),
        PredicateOperation::GreaterThan => compare_numbers(current, &predicate.value, |a, b| a > b),
        PredicateOperation::GreaterOrEqual => {
            compare_numbers(current, &predicate.value, |a, b| a >= b)
        }
        PredicateOperation::LessThan => compare_numbers(current, &predicate.value, |a, b| a < b),
        PredicateOperation::LessOrEqual => {
            compare_numbers(current, &predicate.value, |a, b| a <= b)
        }
    }
}

fn compare_numbers(
    current: Option<&Value>,
    expected: &Value,
    compare: impl FnOnce(f64, f64) -> bool,
) -> bool {
    current
        .and_then(Value::as_f64)
        .zip(expected.as_f64())
        .is_some_and(|(current, expected)| compare(current, expected))
}

fn apply_effect(
    state: &mut CausalState,
    effect: &CausalStateEffect,
) -> Result<StateChange, String> {
    let before = state.get(&effect.key).cloned();
    match effect.operation {
        EffectOperation::Set => {
            state.insert(effect.key.clone(), effect.value.clone());
        }
        EffectOperation::Remove => {
            state.remove(&effect.key);
        }
        EffectOperation::Add | EffectOperation::Multiply => {
            let current = before.as_ref().and_then(Value::as_f64).ok_or_else(|| {
                format!("effect on {} requires existing numeric state", effect.key)
            })?;
            let operand = effect
                .value
                .as_f64()
                .ok_or_else(|| format!("effect on {} requires numeric value", effect.key))?;
            let value = if effect.operation == EffectOperation::Add {
                current + operand
            } else {
                current * operand
            };
            state.insert(effect.key.clone(), Value::from(value));
        }
    }
    Ok(StateChange {
        key: effect.key.clone(),
        before,
        after: state.get(&effect.key).cloned(),
    })
}

fn compare_timelines(
    reality: &CausalTimelineResult,
    counterfactual: &CausalTimelineResult,
    intervention: &DecisionIntervention,
) -> CausalReplayComparison {
    let keys = reality
        .final_state
        .keys()
        .chain(counterfactual.final_state.keys())
        .cloned()
        .collect::<HashSet<_>>();
    let mut state_deltas = keys
        .into_iter()
        .filter_map(|key| {
            let factual = reality.final_state.get(&key).cloned();
            let alternative = counterfactual.final_state.get(&key).cloned();
            (factual != alternative).then(|| CausalStateDelta {
                numeric_delta: factual
                    .as_ref()
                    .and_then(Value::as_f64)
                    .zip(alternative.as_ref().and_then(Value::as_f64))
                    .map(|(factual, alternative)| alternative - factual),
                key,
                reality: factual,
                counterfactual: alternative,
            })
        })
        .collect::<Vec<_>>();
    state_deltas.sort_by(|left, right| left.key.cmp(&right.key));
    let mut intervention_keys = intervention
        .replacement
        .effects
        .iter()
        .map(|effect| effect.key.clone())
        .collect::<HashSet<_>>();
    if let Some(original) = reality
        .events
        .iter()
        .find(|event| event.source_event_id == intervention.target_event_id)
    {
        intervention_keys.extend(
            original
                .state_changes
                .iter()
                .map(|change| change.key.clone()),
        );
    }
    let direct_effects = state_deltas
        .iter()
        .filter(|delta| intervention_keys.contains(&delta.key))
        .map(|delta| delta.key.clone())
        .collect();
    let downstream_effects = state_deltas
        .iter()
        .filter(|delta| !intervention_keys.contains(&delta.key))
        .map(|delta| delta.key.clone())
        .collect();
    let incompatible_events = counterfactual
        .events
        .iter()
        .filter(|event| event.status == ReplayEventStatus::Skipped)
        .map(|event| event.source_event_id.clone())
        .collect();
    let common_replayed_events = reality
        .events
        .iter()
        .filter(|event| event.status != ReplayEventStatus::Skipped)
        .map(|event| event.source_event_id.clone())
        .filter(|event_id| *event_id != intervention.target_event_id)
        .filter(|event_id| {
            counterfactual.events.iter().any(|event| {
                event.source_event_id == *event_id && event.status != ReplayEventStatus::Skipped
            })
        })
        .collect();
    CausalReplayComparison {
        decision_changed_from: intervention.target_event_id.clone(),
        decision_changed_to: intervention.replacement.event_id.clone(),
        state_deltas,
        direct_effects,
        downstream_effects,
        incompatible_events,
        common_replayed_events,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use serde_json::json;

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
}
