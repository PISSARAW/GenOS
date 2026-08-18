use chrono::{DateTime, Utc};
use std::collections::{HashMap, HashSet};

use super::types::{CausalCheckpoint, CausalEventKind, CausalTimelineEvent, DecisionIntervention};

pub struct ReplayValidationContext<'a> {
    pub checkpoint: &'a CausalCheckpoint,
    pub history_end: DateTime<Utc>,
    pub intervention: &'a DecisionIntervention,
}

pub(crate) fn validate_and_order<'a>(
    ctx: &ReplayValidationContext<'a>,
    events: &'a [CausalTimelineEvent],
) -> Result<Vec<&'a CausalTimelineEvent>, String> {
    if ctx.history_end <= ctx.checkpoint.at {
        return Err("history end must be after the checkpoint".to_string());
    }
    validate_event_window(ctx, events)?;
    validate_intervention_target(ctx.intervention, events)?;

    let mut ordered = events.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| {
        left.occurred_at
            .cmp(&right.occurred_at)
            .then_with(|| left.event_id.cmp(&right.event_id))
    });

    validate_dependencies(&ordered, ctx.intervention)?;
    Ok(ordered)
}

fn validate_event_window(
    ctx: &ReplayValidationContext<'_>,
    events: &[CausalTimelineEvent],
) -> Result<(), String> {
    let mut ids = HashSet::new();
    for event in events {
        if event.event_id.is_empty() || !ids.insert(event.event_id.clone()) {
            return Err("timeline event ids must be non-empty and unique".to_string());
        }
        if event.occurred_at <= ctx.checkpoint.at || event.occurred_at > ctx.history_end {
            return Err(format!(
                "event {} falls outside the replay window",
                event.event_id
            ));
        }
    }
    Ok(())
}

fn validate_intervention_target(
    intervention: &DecisionIntervention,
    events: &[CausalTimelineEvent],
) -> Result<(), String> {
    let target = events
        .iter()
        .find(|event| event.event_id == intervention.target_event_id)
        .ok_or_else(|| "intervention target is absent from history".to_string())?;

    let event_ids = events
        .iter()
        .map(|e| &e.event_id)
        .collect::<HashSet<_>>();

    if target.kind != CausalEventKind::Decision
        || intervention.replacement.kind != CausalEventKind::Decision
        || intervention.replacement.occurred_at != target.occurred_at
        || event_ids.contains(&intervention.replacement.event_id)
    {
        return Err(
            "replacement must be a new decision at the target decision timestamp".to_string(),
        );
    }
    Ok(())
}

fn validate_dependencies(
    ordered: &[&CausalTimelineEvent],
    intervention: &DecisionIntervention,
) -> Result<(), String> {
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
    Ok(())
}
