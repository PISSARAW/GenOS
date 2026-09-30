use crate::{CreativityEngine, Goal, Metabolism, WorldState};
use genos_store::capsule::CreativeMemoryStore;

#[test]
fn engine_memory_and_metrics_survive_process_boundary() {
    let path = std::env::temp_dir().join(format!("genos-creative-{}.json", uuid::Uuid::new_v4()));
    let store = CreativeMemoryStore::new(&path).unwrap();
    let mut first = CreativityEngine::default();
    first.pre_tick(
        &WorldState::default(),
        &Goal::Explore,
        &mut Metabolism::new(10.0),
    );
    first.tick();
    let expected = first.export_memory();
    first.save_checkpoint(&store).unwrap();
    drop(first);

    let mut restarted = CreativityEngine::default();
    assert!(restarted.restore_checkpoint(&store).unwrap());
    let actual = restarted.export_memory();
    assert_eq!(actual.tick_counter, expected.tick_counter);
    assert_eq!(actual.hypotheses.len(), expected.hypotheses.len());
    assert_eq!(
        actual.metrics.dreams_generated,
        expected.metrics.dreams_generated
    );
    assert_eq!(
        actual.metrics.recombined_hypotheses,
        expected.metrics.recombined_hypotheses
    );
    std::fs::remove_file(path).unwrap();
}

#[test]
fn absent_checkpoint_is_a_clean_start() {
    let path = std::env::temp_dir().join(format!("genos-creative-{}.json", uuid::Uuid::new_v4()));
    let store = CreativeMemoryStore::new(&path).unwrap();
    let mut engine = CreativityEngine::default();
    assert!(!engine.restore_checkpoint(&store).unwrap());
}
