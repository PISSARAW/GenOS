use crate::GenosEcosystem;
use uuid::Uuid;

impl GenosEcosystem {
    pub fn set_mission_id(&mut self, mission_id: Uuid) {
        self.mission_id = Some(mission_id);
    }

    pub fn set_reproduction_seed(&mut self, seed: u64) -> Result<(), String> {
        self.restore_reproduction_seed(Some(seed))
    }

    pub fn reproduction_seed(&self) -> Option<u64> {
        self.reproduction_seed
    }

    pub(crate) fn restore_reproduction_seed(&mut self, seed: Option<u64>) -> Result<(), String> {
        if let (Some(current), Some(restored)) = (self.reproduction_seed, seed) {
            if current != restored {
                return Err("reproduction campaign seed mismatch".into());
            }
        }
        if self.reproduction_seed.is_none() {
            self.reproduction_seed = seed;
        }
        Ok(())
    }
}
