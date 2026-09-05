pub mod capsule;
pub mod cryptobiosis;
pub mod event;
pub mod fossil;
pub mod snapshot;

pub use capsule::{Capsule, CapsuleStore};
pub use cryptobiosis::{CryptobiosisStore, FrozenAgent};
pub use event::{Event, InMemoryEventStore};
pub use fossil::{FossilRecord, FossilRegistry};
pub use snapshot::{SnapshotManifest, SnapshotStore};

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_event_store_append_and_read() {
        let mut store = InMemoryEventStore::new();
        store.append("CELL_BORN", json!({ "name": "Kwame" }));
        store.append("CELL_MUTATE", json!({ "mutation": "A->T" }));
        assert_eq!(store.count(), 2);
        let stream = store.read_stream(2);
        assert_eq!(stream.len(), 1);
        assert_eq!(stream[0].event_type, "CELL_MUTATE");
    }

    #[test]
    fn test_capsule_integrity() {
        let mut store = CapsuleStore::new();
        let capsule = Capsule::create("boundary_1", json!({ "state": "active", "tokens": 42 }));
        assert!(capsule.verify());
        let id = store.store(capsule);
        assert!(store.get(&id).unwrap().verify());
    }

    #[test]
    fn test_cryptobiosis_freeze_and_thaw() {
        let mut vault = CryptobiosisStore::new();
        vault.freeze("agent_chidi", json!({ "memory": ["insight1", "insight2"] }));
        assert!(vault.is_dormant("agent_chidi"));
        let thawed = vault.thaw("agent_chidi");
        assert!(thawed.is_some());
        assert!(!vault.is_dormant("agent_chidi"));
    }
}
