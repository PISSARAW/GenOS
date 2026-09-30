use crate::GenosEcosystem;
use uuid::Uuid;

impl GenosEcosystem {
    pub fn set_mission_id(&mut self, mission_id: Uuid) {
        self.mission_id = Some(mission_id);
    }
}
