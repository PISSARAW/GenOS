use super::creativity_engine::{CreativityConfig, CreativityEngine, CreativityMetrics};
use super::FocusedTask;
use crate::metabolism::Metabolism;
use crate::planner::{Goal, WorldState};
use genos_store::capsule::CreativeMemoryStore;
use std::path::Path;

/// Moteur historique relié au stockage versionné du workspace.
pub struct PersistentCreativityEngine {
    engine: CreativityEngine,
    store: CreativeMemoryStore,
}

impl PersistentCreativityEngine {
    pub fn open(
        config: CreativityConfig,
        checkpoint_path: impl AsRef<Path>,
    ) -> std::io::Result<Self> {
        let store = CreativeMemoryStore::new(checkpoint_path.as_ref())?;
        let mut engine = CreativityEngine::new(config);
        engine.restore_checkpoint(&store)?;
        Ok(Self { engine, store })
    }

    pub fn pre_tick(
        &mut self,
        world: &WorldState,
        goal: &Goal,
        metabolism: &mut Metabolism,
    ) -> std::io::Result<Vec<FocusedTask>> {
        let tasks = self.engine.pre_tick(world, goal, metabolism);
        self.engine.clear_pending_tasks();
        self.engine.save_checkpoint(&self.store)?;
        Ok(tasks)
    }

    pub fn metrics(&self) -> &CreativityMetrics {
        self.engine.metrics()
    }
}

#[cfg(test)]
mod tests {
    use crate::GenosEcosystem;
    use crate::planner::Goal;
    use uuid::Uuid;

    #[test]
    fn historical_engine_restores_memory_after_process_restart() {
        let path = std::env::temp_dir().join(format!("creative-runtime-{}.json", Uuid::new_v4()));
        let mut first = GenosEcosystem::new("creative-runtime-test");
        first.enable_creativity_checkpoint(&path).unwrap();
        first.tick(&Goal::Explore);
        let generated = first.creativity.as_ref().unwrap().metrics().dreams_generated;
        assert!(generated > 0);
        drop(first);

        let mut restored = GenosEcosystem::new("creative-runtime-test");
        restored.enable_creativity_checkpoint(&path).unwrap();
        assert_eq!(
            restored.creativity.as_ref().unwrap().metrics().dreams_generated,
            generated
        );
        std::fs::remove_file(path).unwrap();
    }
}
