use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Event {
    pub id: Uuid,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub timestamp: String,
    pub sequence: u64,
}

impl Event {
    pub fn new(event_type: &str, payload: serde_json::Value, sequence: u64) -> Self {
        Self {
            id: Uuid::new_v4(),
            event_type: event_type.to_string(),
            payload,
            timestamp: Utc::now().to_rfc3339(),
            sequence,
        }
    }
}

#[derive(Default)]
pub struct InMemoryEventStore {
    events: Vec<Event>,
}

impl InMemoryEventStore {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    pub fn append(&mut self, event_type: &str, payload: serde_json::Value) -> Event {
        let seq = self.events.len() as u64 + 1;
        let event = Event::new(event_type, payload, seq);
        self.events.push(event.clone());
        event
    }

    pub fn read_stream(&self, from_sequence: u64) -> Vec<Event> {
        self.events
            .iter()
            .filter(|e| e.sequence >= from_sequence)
            .cloned()
            .collect()
    }

    pub fn count(&self) -> usize {
        self.events.len()
    }
}
