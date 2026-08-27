//! Branch-local memories.
//!
//! Recording a memory is the same kind of act as writing a variable — see
//! [`crate::variables`] — with one addition: a memory carries provenance. It
//! knows which branch created it, when, and on what basis, so a diff between
//! two branches can report where a memory appeared rather than only that the
//! two sides disagree.

use crate::events::{AgentEvent, AgentEventType};
use crate::ids::{EventId, MemoryId};
use crate::snapshot::AgentSnapshot;
use crate::state::{AgentState, MemoryKind, MemoryRecord};
use chrono::{DateTime, Utc};
use serde_json::json;

impl AgentState {
    /// The record behind a memory id, if this branch holds it.
    pub fn memory(&self, id: &MemoryId) -> Option<&MemoryRecord> {
        self.memories.iter().find(|record| &record.id == id)
    }

    /// Memories of one kind, in the order they were recorded.
    pub fn memories_of_kind(&self, kind: MemoryKind) -> impl Iterator<Item = &MemoryRecord> {
        self.memories
            .iter()
            .filter(move |record| record.kind == kind)
    }

    /// Ids indexing memories of one kind: `semantic_memory.refs` or
    /// `episodic_memory.refs`.
    pub fn refs_of_kind(&self, kind: MemoryKind) -> &[MemoryId] {
        match kind {
            MemoryKind::Semantic => &self.semantic_memory.refs,
            MemoryKind::Episodic => &self.episodic_memory.refs,
        }
    }
}

impl AgentSnapshot {
    /// The record behind a memory id, if this branch holds it.
    pub fn memory(&self, id: &MemoryId) -> Option<&MemoryRecord> {
        self.state.memory(id)
    }
}

/// A memory recorded on a branch, with the event that records it.
#[derive(Clone, Debug, PartialEq)]
pub struct MemoryWrite {
    pub record: MemoryRecord,
    /// Event carrying the new memory, already bound to the writer's branch and
    /// numbered at the branch's next sequence.
    pub event: AgentEvent,
}

/// Record a new memory on `snapshot`'s own branch and advance its event cursor.
///
/// The record is appended to `state.memories` and its id to the ref list for
/// its kind, so the index and the content stay in step. `created_in` is the
/// snapshot's branch: that is the provenance a later diff reports. The returned
/// event is the caller's to append to an event store.
#[allow(clippy::too_many_arguments)]
pub fn add_memory_on_branch(
    snapshot: &mut AgentSnapshot,
    kind: MemoryKind,
    content: &str,
    source: Option<&str>,
) -> MemoryWrite {
    add_memory_on_branch_at(snapshot, kind, content, source, Utc::now())
}

/// [`add_memory_on_branch`] with an explicit timestamp, for deterministic tests.
#[allow(clippy::too_many_arguments)]
pub fn add_memory_on_branch_at(
    snapshot: &mut AgentSnapshot,
    kind: MemoryKind,
    content: &str,
    source: Option<&str>,
    created_at: DateTime<Utc>,
) -> MemoryWrite {
    let record = MemoryRecord {
        id: MemoryId::new(),
        kind,
        content: content.to_string(),
        created_in: snapshot.branch_id.clone(),
        created_at,
        source: source.map(str::to_string),
    };

    match kind {
        MemoryKind::Semantic => snapshot.state.semantic_memory.refs.push(record.id.clone()),
        MemoryKind::Episodic => snapshot.state.episodic_memory.refs.push(record.id.clone()),
    }
    snapshot.state.memories.push(record.clone());

    let sequence = snapshot.state.event_cursor.sequence + 1;
    let event = AgentEvent {
        cost_schema: None,
        event_id: EventId::new(),
        agent_id: snapshot.agent_id.clone(),
        branch_id: Some(snapshot.branch_id.clone()),
        sequence,
        timestamp: created_at,
        event_type: AgentEventType::MemoryCreated,
        payload: json!({
            "memory_id": record.id.0,
            "kind": record.kind,
            "content": record.content,
            "source": record.source,
            "created_in": record.created_in.0,
        }),
        causation_id: None,
        correlation_id: None,
    };

    snapshot.state.event_cursor.sequence = sequence;
    snapshot.state.event_cursor.last_event_id = Some(event.event_id.clone());

    MemoryWrite { record, event }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fork_snapshot;
    use crate::snapshot::tests::snapshot_with_variable;

    const FACT: &str = "The API uses PostgreSQL";

    /// The case this module exists for: one branch records a memory, the other
    /// records nothing, and the parent keeps an empty memory.
    #[test]
    fn a_memory_recorded_on_one_branch_stays_on_that_branch() {
        let parent = snapshot_with_variable("counter", "0");
        assert!(parent.state.memories.is_empty());

        let mut a = fork_snapshot(&parent);
        let b = fork_snapshot(&parent);

        let write = add_memory_on_branch(&mut a, MemoryKind::Semantic, FACT, Some("schema-probe"));

        assert_eq!(a.state.memories.len(), 1);
        assert_eq!(
            a.memory(&write.record.id).map(|m| m.content.as_str()),
            Some(FACT)
        );
        assert!(b.state.memories.is_empty());
        assert!(parent.state.memories.is_empty());
        assert!(b.memory(&write.record.id).is_none());
        assert!(parent.memory(&write.record.id).is_none());
    }

    #[test]
    fn a_new_memory_carries_the_branch_that_created_it() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a = fork_snapshot(&parent);

        let write = add_memory_on_branch(&mut a, MemoryKind::Semantic, FACT, Some("schema-probe"));

        assert_eq!(write.record.created_in, a.branch_id);
        assert_ne!(write.record.created_in, parent.branch_id);
        assert_eq!(write.record.source.as_deref(), Some("schema-probe"));
        assert_eq!(write.record.kind, MemoryKind::Semantic);
    }

    #[test]
    fn the_ref_index_and_the_records_stay_in_step() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a = fork_snapshot(&parent);

        let semantic = add_memory_on_branch(&mut a, MemoryKind::Semantic, FACT, None);
        let episodic = add_memory_on_branch(&mut a, MemoryKind::Episodic, "Ran the probe", None);

        assert_eq!(a.state.memories.len(), 2);
        assert!(a.state.semantic_memory.refs.contains(&semantic.record.id));
        assert_eq!(
            a.state.episodic_memory.refs,
            vec![episodic.record.id.clone()]
        );

        // Every record this branch holds is indexed by the ref list for its
        // kind. The converse does not hold: a ref may point at a memory whose
        // content lives elsewhere, which is why the fixture's seeded ref has no
        // record behind it.
        for kind in [MemoryKind::Semantic, MemoryKind::Episodic] {
            for record in a.state.memories_of_kind(kind) {
                assert!(
                    a.state.refs_of_kind(kind).contains(&record.id),
                    "{:?} memory {} is missing from its ref index",
                    kind,
                    record.id
                );
            }
        }
    }

    #[test]
    fn the_memory_event_lands_on_the_recording_branch() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a = fork_snapshot(&parent);
        let mut b = fork_snapshot(&parent);

        let write_a =
            add_memory_on_branch(&mut a, MemoryKind::Semantic, FACT, Some("schema-probe"));
        let write_b = add_memory_on_branch(&mut b, MemoryKind::Semantic, "Something else", None);

        assert_eq!(write_a.event.event_type, AgentEventType::MemoryCreated);
        assert_eq!(write_a.event.branch_id.as_ref(), Some(&a.branch_id));
        assert_eq!(write_a.event.agent_id, a.agent_id);
        assert_eq!(write_a.event.payload["memory_id"], write_a.record.id.0);
        assert_eq!(write_a.event.payload["content"], FACT);
        assert_eq!(write_a.event.payload["kind"], "semantic");
        assert_eq!(write_a.event.payload["source"], "schema-probe");
        assert_eq!(write_a.event.payload["created_in"], a.branch_id.0);

        // Both branches inherited the same watermark, so both records are the
        // first event of their own stream.
        assert_eq!(write_a.event.sequence, 1);
        assert_eq!(write_b.event.sequence, 1);
        assert_ne!(write_a.event.branch_id, write_b.event.branch_id);

        assert_eq!(a.state.event_cursor.sequence, 1);
        assert_eq!(
            a.state.event_cursor.last_event_id,
            Some(write_a.event.event_id.clone())
        );
        assert_eq!(parent.state.event_cursor.sequence, 0);
    }

    #[test]
    fn a_memory_without_a_source_records_none() {
        let parent = snapshot_with_variable("counter", "0");
        let mut a = fork_snapshot(&parent);

        let write = add_memory_on_branch(&mut a, MemoryKind::Semantic, FACT, None);

        assert_eq!(write.record.source, None);
        assert_eq!(write.event.payload["source"], serde_json::Value::Null);
    }
}
