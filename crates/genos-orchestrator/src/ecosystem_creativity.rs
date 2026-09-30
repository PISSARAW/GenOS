use crate::GenosEcosystem;
use crate::creativity::{CreativityConfig, PersistentCreativityEngine};
use std::path::Path;

impl GenosEcosystem {
    pub fn enable_creativity_checkpoint(
        &mut self,
        checkpoint_path: impl AsRef<Path>,
    ) -> std::io::Result<()> {
        self.creativity = Some(PersistentCreativityEngine::open(
            CreativityConfig::default(),
            checkpoint_path,
        )?);
        Ok(())
    }
}
