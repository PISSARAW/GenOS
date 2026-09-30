use crate::{
    CreativityConfig, Goal, Metabolism, PersistentCreativityEngine, PreTickInput, WorldState,
};

#[test]
fn persistent_engine_checkpoints_each_tick_boundary() {
    let path = std::env::temp_dir().join(format!("genos-creative-{}.json", uuid::Uuid::new_v4()));
    let mut engine = PersistentCreativityEngine::open(CreativityConfig::default(), &path).unwrap();
    engine
        .pre_tick(PreTickInput {
            world: &WorldState::default(),
            goal: &Goal::Explore,
            metabolism: &mut Metabolism::new(10.0),
        })
        .unwrap();
    engine.tick().unwrap();
    let expected_count = engine.dreaming_history().len();
    drop(engine);

    let restored = PersistentCreativityEngine::open(CreativityConfig::default(), &path).unwrap();
    assert_eq!(restored.dreaming_history().len(), expected_count);
    assert_eq!(restored.metrics().dreams_generated, 1);
    std::fs::remove_file(path).unwrap();
}
