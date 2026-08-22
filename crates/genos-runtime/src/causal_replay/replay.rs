use chrono::{DateTime, Utc};
use serde_json::Value;
use std::collections::HashSet;

use super::state_engine::{apply_effect, predicate_matches};
use super::types::{
    CausalCheckpoint, CausalReplayComparison, CausalState, CausalStateDelta, CausalTimelineEvent,
    CausalTimelineResult, DecisionIntervention, PersonalCausalReplayManifest,
    PersonalCausalReplayReport, ReplayEventStatus, ReplayedCausalEvent,
};
use super::validation::{validate_and_order, ReplayValidationContext};

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
    let ctx = ReplayValidationContext {
        checkpoint: &checkpoint,
        history_end,
        intervention,
    };
    let history = validate_and_order(&ctx, events)?;
    let reality = replay("reality", &checkpoint.state, &history, None)?;
    let counterfactual = replay(
        "counterfactual",
        &checkpoint.state,
        &history,
        Some(intervention),
    )?;
    let comparison = compare_timelines(&reality, &counterfactual, intervention);
    let primitive_trace =
        build_primitive_trace(&checkpoint, &reality, &counterfactual, &comparison);

    Ok(PersonalCausalReplayReport {
        checkpoint,
        history_end,
        reality,
        counterfactual,
        comparison,
        primitive_trace,
    })
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

        let missing_deps = find_missing_deps(effective, &processed);
        let failed_preds = find_failed_preconditions(effective, &state);

        if !missing_deps.is_empty() || !failed_preds.is_empty() {
            replayed.push(ReplayedCausalEvent {
                source_event_id: source.event_id.clone(),
                effective_event_id: effective.event_id.clone(),
                occurred_at: effective.occurred_at,
                status: ReplayEventStatus::Skipped,
                description: effective.description.clone(),
                state_changes: vec![],
                reason: Some(format!(
                    "missing_dependencies={missing_deps:?}; failed_preconditions={failed_preds:?}"
                )),
            });
            continue;
        }

        let changes = execute_event_effects(effective, &mut state)?;
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

fn find_missing_deps(event: &CausalTimelineEvent, processed: &HashSet<String>) -> Vec<String> {
    event
        .depends_on
        .iter()
        .filter(|dep| !processed.contains(*dep))
        .cloned()
        .collect()
}

fn find_failed_preconditions(event: &CausalTimelineEvent, state: &CausalState) -> Vec<String> {
    event
        .preconditions
        .iter()
        .filter(|predicate| !predicate_matches(state, predicate))
        .map(|predicate| predicate.key.clone())
        .collect()
}

fn execute_event_effects(
    event: &CausalTimelineEvent,
    state: &mut CausalState,
) -> Result<Vec<super::types::StateChange>, String> {
    let mut changes = Vec::new();
    for effect in &event.effects {
        if effect
            .when
            .iter()
            .all(|predicate| predicate_matches(state, predicate))
        {
            changes.push(apply_effect(state, effect)?);
        }
    }
    Ok(changes)
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

fn build_primitive_trace(
    checkpoint: &CausalCheckpoint,
    reality: &CausalTimelineResult,
    counterfactual: &CausalTimelineResult,
    comparison: &CausalReplayComparison,
) -> crate::AgentPrimitiveTrace {
    let mut primitive_trace = crate::AgentPrimitiveTrace::default();
    primitive_trace.completed(
        crate::AgentPrimitive::Snapshot,
        checkpoint.agent_ref.clone(),
        serde_json::json!({ "at": checkpoint.at }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Restore,
        checkpoint.agent_ref.clone(),
        serde_json::json!({ "state_keys": checkpoint.state.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Fork,
        checkpoint.agent_ref.clone(),
        serde_json::json!({ "branches": ["reality", "counterfactual"] }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Replay,
        "reality",
        serde_json::json!({ "events": reality.events.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Replay,
        "counterfactual",
        serde_json::json!({ "events": counterfactual.events.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Diff,
        "reality..counterfactual",
        serde_json::json!({ "state_deltas": comparison.state_deltas.len() }),
    );
    primitive_trace.completed(
        crate::AgentPrimitive::Lineage,
        checkpoint.agent_ref.clone(),
        serde_json::json!({ "children": 2 }),
    );
    primitive_trace
}
