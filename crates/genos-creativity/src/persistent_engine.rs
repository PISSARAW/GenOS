use crate::consolidation::ConsolidationTarget;
use crate::creativity_engine::CreativityEngine;
use crate::dopamine::{CreativityOutcome, DopamineTarget};
use crate::salience::FocusedTask;
use crate::types::{Concept, Goal, Metabolism, WorldState};
use crate::{CreativityConfig, CreativityMetrics};
use genos_store::capsule::CreativeMemoryStore;
use std::path::Path;

pub struct PreTickInput<'a> {
    pub world: &'a WorldState,
    pub goal: &'a Goal,
    pub metabolism: &'a mut Metabolism,
}

/// Creativity engine that checkpoints after every public state-changing phase.
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

    pub fn pre_tick(&mut self, input: PreTickInput<'_>) -> std::io::Result<Vec<FocusedTask>> {
        let focused = self
            .engine
            .pre_tick(input.world, input.goal, input.metabolism);
        self.engine.save_checkpoint(&self.store)?;
        Ok(focused)
    }

    pub fn post_tick<D: DopamineTarget + ConsolidationTarget>(
        &mut self,
        director: &mut D,
        executed: &[(Concept, CreativityOutcome)],
    ) -> std::io::Result<()> {
        self.engine.post_tick(director, executed);
        self.engine.save_checkpoint(&self.store)
    }

    pub fn tick(&mut self) -> std::io::Result<()> {
        self.engine.tick();
        self.engine.save_checkpoint(&self.store)
    }

    pub fn metrics(&self) -> CreativityMetrics {
        self.engine.metrics()
    }

    pub fn dreaming_history(&self) -> Vec<crate::RawHypothesis> {
        self.engine.export_memory().hypotheses
    }
}
