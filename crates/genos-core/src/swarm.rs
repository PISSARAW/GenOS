//! Parking-lot swarm primitives.
//!
//! Tracks up to [`MAX_SLOTS`] active agent slots and a parking lot of
//! suspended agents waiting to be reactivated.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Maximum number of concurrently active agent slots.
pub const MAX_SLOTS: usize = 3;

/// Status of a swarm slot.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SlotStatus {
    Active,
    Parked,
}

/// One agent slot — either active or parked.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SwarmSlot {
    pub agent_id: String,
    pub task_id: String,
    pub task_text: String,
    pub status: SlotStatus,
    pub assigned_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parked_at: Option<DateTime<Utc>>,
}

impl SwarmSlot {
    pub fn new(agent_id: impl Into<String>, task_id: impl Into<String>, task_text: impl Into<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            task_id: task_id.into(),
            task_text: task_text.into(),
            status: SlotStatus::Active,
            assigned_at: Utc::now(),
            parked_at: None,
        }
    }

    pub fn park(&mut self) {
        self.status = SlotStatus::Parked;
        self.parked_at = Some(Utc::now());
    }

    pub fn wake(&mut self) {
        self.status = SlotStatus::Active;
        self.parked_at = None;
    }
}

/// Full state of the swarm: active slots + parking lot.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SwarmState {
    pub slots: Vec<SwarmSlot>,
    pub lot: Vec<SwarmSlot>,
}

impl SwarmState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Assign a task to an agent. If [`MAX_SLOTS`] are occupied, park the
    /// oldest active slot first.
    pub fn assign(&mut self, agent_id: impl Into<String>, task_id: impl Into<String>, task_text: impl Into<String>) -> Option<SwarmSlot> {
        let evicted = if self.slots.len() >= MAX_SLOTS {
            let mut oldest = self.slots.remove(0);
            oldest.park();
            self.lot.push(oldest.clone());
            Some(oldest)
        } else {
            None
        };
        let _ = evicted;
        let slot = SwarmSlot::new(agent_id, task_id, task_text);
        self.slots.push(slot);
        self.slots.last().cloned()
    }

    /// Manually park the slot owned by `agent_id`. Returns `false` if not found.
    pub fn park(&mut self, agent_id: &str) -> bool {
        if let Some(pos) = self.slots.iter().position(|s| s.agent_id == agent_id) {
            let mut slot = self.slots.remove(pos);
            slot.park();
            self.lot.push(slot);
            true
        } else {
            false
        }
    }

    /// Reactivate a parked agent by `agent_id`. Returns the slot or `None`.
    pub fn wake(&mut self, agent_id: &str) -> Option<SwarmSlot> {
        let pos = self.lot.iter().position(|s| s.agent_id == agent_id)?;
        let mut slot = self.lot.remove(pos);
        slot.wake();
        self.slots.push(slot.clone());
        Some(slot)
    }

    pub fn active_count(&self) -> usize {
        self.slots.len()
    }

    pub fn parked_count(&self) -> usize {
        self.lot.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assign_parks_oldest_when_full() {
        let mut state = SwarmState::new();
        state.assign("backend", "t1", "api work");
        state.assign("frontend", "t2", "ui work");
        state.assign("qa", "t3", "test work");
        assert_eq!(state.active_count(), 3);
        assert_eq!(state.parked_count(), 0);

        state.assign("backend", "t4", "more api work");
        assert_eq!(state.active_count(), 3);
        assert_eq!(state.parked_count(), 1);
        assert_eq!(state.lot[0].agent_id, "backend");
        assert_eq!(state.lot[0].status, SlotStatus::Parked);
    }

    #[test]
    fn wake_moves_from_lot_to_slots() {
        let mut state = SwarmState::new();
        for i in 0..4u8 {
            state.assign(format!("agent{i}"), format!("t{i}"), "task");
        }
        assert_eq!(state.parked_count(), 1);
        let woken = state.wake("agent0");
        assert!(woken.is_some());
        assert_eq!(woken.unwrap().status, SlotStatus::Active);
        assert_eq!(state.parked_count(), 0);
        assert_eq!(state.active_count(), 4);
    }

    #[test]
    fn manual_park_removes_from_active() {
        let mut state = SwarmState::new();
        state.assign("backend", "t1", "task");
        assert!(state.park("backend"));
        assert_eq!(state.active_count(), 0);
        assert_eq!(state.parked_count(), 1);
    }
}
