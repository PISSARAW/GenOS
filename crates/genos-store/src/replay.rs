use genos_core::{AgentEvent, AgentEventType, AgentId, AgentSnapshot, BranchId, EventId};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentLifecycle {
    Created,
    Running,
    Stopped,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BranchStatus {
    Active,
    Completed,
    Interrupted,
    BudgetExhausted,
    TimedOut,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BasicReplayState {
    pub agent_id: Option<AgentId>,
    pub branch_id: Option<BranchId>,
    pub lifecycle: AgentLifecycle,
    pub last_event_id: Option<EventId>,
    pub last_sequence: u64,
    pub steps: u64,
    pub model_calls: u64,
    pub tool_calls: u64,
    pub tool_failures: u64,
    pub snapshots_created: u64,
    /// Variables reconstructed from memory events, independently of a snapshot.
    #[serde(default)]
    pub variables: BTreeMap<String, String>,
    pub branch_status: BranchStatus,
}

impl Default for BasicReplayState {
    fn default() -> Self {
        Self {
            agent_id: None,
            branch_id: None,
            lifecycle: AgentLifecycle::Created,
            last_event_id: None,
            last_sequence: 0,
            steps: 0,
            model_calls: 0,
            tool_calls: 0,
            tool_failures: 0,
            snapshots_created: 0,
            variables: BTreeMap::new(),
            branch_status: BranchStatus::Active,
        }
    }
}

pub fn replay_basic_state(events: &[AgentEvent]) -> BasicReplayState {
    replay_basic_state_from(BasicReplayState::default(), events)
}

pub fn basic_state_from_snapshot(snapshot: &AgentSnapshot) -> BasicReplayState {
    BasicReplayState {
        agent_id: Some(snapshot.agent_id.clone()),
        branch_id: Some(snapshot.branch_id.clone()),
        lifecycle: AgentLifecycle::Created,
        last_event_id: snapshot.state.event_cursor.last_event_id.clone(),
        last_sequence: snapshot.state.event_cursor.sequence,
        steps: snapshot.state.execution.step,
        model_calls: 0,
        tool_calls: 0,
        tool_failures: 0,
        snapshots_created: 0,
        variables: snapshot
            .state
            .working_memory
            .items
            .iter()
            .map(|item| (item.key.clone(), item.value.clone()))
            .collect(),
        branch_status: BranchStatus::Active,
    }
}

pub fn replay_basic_state_from(
    mut state: BasicReplayState,
    events: &[AgentEvent],
) -> BasicReplayState {
    for event in events {
        state.agent_id = Some(event.agent_id.clone());
        state.branch_id = event.branch_id.clone();
        state.last_event_id = Some(event.event_id.clone());
        state.last_sequence = event.sequence;
        apply_event_transition(&mut state, event);
    }

    check_interrupted_branch(&mut state, events);
    check_duration_timeout(&mut state, events);

    state
}

fn apply_event_transition(state: &mut BasicReplayState, event: &AgentEvent) {
    match event.event_type {
        AgentEventType::AgentStep => {
            state.lifecycle = AgentLifecycle::Running;
            state.steps += 1;
        }
        AgentEventType::ForkCompleted => {
            state.branch_status = BranchStatus::Completed;
        }
        AgentEventType::ForkCreated
        | AgentEventType::ForkStarted
        | AgentEventType::WorldCreated
        | AgentEventType::ToolRequested => {
            state.branch_status = BranchStatus::Active;
        }
        AgentEventType::AgentCreated => {
            state.lifecycle = AgentLifecycle::Created;
        }
        AgentEventType::AgentStarted => {
            state.lifecycle = AgentLifecycle::Running;
        }
        AgentEventType::AgentStopped => {
            state.lifecycle = AgentLifecycle::Stopped;
        }
        AgentEventType::ModelResponded => {
            apply_model_response(state, event);
        }
        AgentEventType::ToolCompleted => {
            state.tool_calls += 1;
        }
        AgentEventType::ToolFailed => {
            state.tool_calls += 1;
            state.tool_failures += 1;
        }
        AgentEventType::SnapshotCreated => {
            state.snapshots_created += 1;
        }
        AgentEventType::MemoryCreated | AgentEventType::MemoryUpdated => {
            apply_memory_update(state, event);
        }
        _ => {}
    }
}

fn apply_model_response(state: &mut BasicReplayState, event: &AgentEvent) {
    state.steps += 1;
    state.model_calls += 1;
    if event
        .payload
        .get("max_steps")
        .and_then(|value| value.as_u64())
        .is_some_and(|max_steps| state.steps >= max_steps)
    {
        state.branch_status = BranchStatus::BudgetExhausted;
        state.lifecycle = AgentLifecycle::Stopped;
    }
}

fn apply_memory_update(state: &mut BasicReplayState, event: &AgentEvent) {
    if let (Some(key), Some(value)) = (
        event.payload.get("key").and_then(|value| value.as_str()),
        event.payload.get("value").and_then(|value| value.as_str()),
    ) {
        state.variables.insert(key.to_string(), value.to_string());
    }
}

fn check_interrupted_branch(state: &mut BasicReplayState, events: &[AgentEvent]) {
    // A restart can only observe the durable prefix. An outstanding request
    // means the branch did not complete and must remain visible as interrupted.
    if state.branch_status != BranchStatus::BudgetExhausted
        && events
            .last()
            .is_some_and(|event| event.event_type == AgentEventType::ToolRequested)
    {
        state.branch_status = BranchStatus::Interrupted;
    }
}

fn check_duration_timeout(state: &mut BasicReplayState, events: &[AgentEvent]) {
    if let (Some(first), Some(last), Some(max_duration)) = (
        events.first().map(|event| event.timestamp),
        events.last().map(|event| event.timestamp),
        events.iter().find_map(|event| {
            event
                .payload
                .get("max_duration_seconds")
                .and_then(|value| value.as_i64())
        }),
    ) {
        if (last - first).num_seconds() >= max_duration {
            state.branch_status = BranchStatus::TimedOut;
            state.lifecycle = AgentLifecycle::Stopped;
        }
    }
}
