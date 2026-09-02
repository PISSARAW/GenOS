use crate::cell::*;
use uuid::Uuid;
use crate::genome::Genome;

pub struct AgentCellBuilder {
    cell_id: Uuid,
    specialization: Specialization,
    mind: Option<Mind>,
    // we can add other fields as options or default them
}

impl AgentCellBuilder {
    pub fn new() -> Self {
        Self {
            cell_id: Uuid::new_v4(),
            specialization: Specialization::Undefined,
            mind: None,
        }
    }

    pub fn specialization(mut self, spec: Specialization) -> Self {
        self.specialization = spec;
        self
    }

    pub fn with_mind(mut self) -> Self {
        self.mind = Some(Mind::default());
        self
    }

    pub fn build(self) -> AgentCell {
        let mut cell = AgentCell::default();
        cell.cell_id = self.cell_id;
        cell.specialization = self.specialization;
        cell.mind = self.mind;
        cell
    }
}
