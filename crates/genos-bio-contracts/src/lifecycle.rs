use serde::{Deserialize, Serialize};

use super::{check_compatible, SCHEMA_VERSION};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum CellStage {
    Naissance,
    Differenciation,
    Activite,
    Dormance,
    Senescence,
    Apoptose,
    Recuperation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CellLifecycle {
    pub cell_id: String,
    pub stage: CellStage,
    pub schema_version: String,
}

impl CellLifecycle {
    pub fn new(cell_id: &str) -> Self {
        Self {
            cell_id: cell_id.to_string(),
            stage: CellStage::Naissance,
            schema_version: SCHEMA_VERSION.to_string(),
        }
    }

    pub fn transition(&mut self, next: CellStage) -> Result<(), String> {
        check_compatible(&self.schema_version)?;
        if allowed(&self.stage, &next) {
            self.stage = next;
            Ok(())
        } else {
            Err(reject(&self.stage, &next))
        }
    }
}

pub fn allowed(from: &CellStage, next: &CellStage) -> bool {
    matches!(
        (from, next),
        (
            CellStage::Naissance,
            CellStage::Differenciation | CellStage::Activite
        ) | (
            CellStage::Differenciation,
            CellStage::Activite | CellStage::Dormance
        ) | (
            CellStage::Activite,
            CellStage::Dormance | CellStage::Senescence | CellStage::Apoptose
        ) | (
            CellStage::Dormance,
            CellStage::Activite | CellStage::Recuperation | CellStage::Apoptose
        ) | (
            CellStage::Senescence,
            CellStage::Apoptose | CellStage::Recuperation
        ) | (
            CellStage::Recuperation,
            CellStage::Activite | CellStage::Dormance
        )
    )
}

pub fn reject(from: &CellStage, next: &CellStage) -> String {
    format!("transition interdite {:?} -> {:?}", from, next)
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    #[test]
    fn naissance_puis_differenciation() {
        let mut life = CellLifecycle::new("cell_demo_000001");
        assert_eq!(life.stage, CellStage::Naissance);
        assert!(life.transition(CellStage::Differenciation).is_ok());
    }

    #[test]
    fn apoptose_est_terminale() {
        let mut life = CellLifecycle::new("cell_demo_000002");
        assert!(life.transition(CellStage::Activite).is_ok());
        assert!(life.transition(CellStage::Apoptose).is_ok());
        assert!(life.transition(CellStage::Activite).is_err());
    }

    #[test]
    fn version_incompatible_refusee() {
        let mut life = CellLifecycle::new("cell_demo_000003");
        life.schema_version = "9.9.9".to_string();
        assert!(life.transition(CellStage::Activite).is_err());
    }
}
