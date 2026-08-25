//! Regeneration mapped to tissue (module) restoration.
//!
//! Biological mechanism: Certain organisms (like axolotls or starfish) can
//! regenerate lost limbs or damaged tissues by reverting cells to a stem-like
//! state (blastema) and rebuilding the structure.
//! GenOS mapping: When a specific module or belief graph branch is corrupted,
//! instead of terminating the agent (Apoptosis), the agent can excise the
//! corrupted data and trigger a targeted regeneration from a known healthy
//! checkpoint (blastema).

#[derive(Debug, Clone, PartialEq)]
pub enum TissueStatus {
    Healthy,
    Corrupted,
    Regenerating,
}

#[derive(Debug, Clone)]
pub struct RegenerativeBlastema {
    pub module_id: String,
    pub base_checkpoint_hash: String,
    pub status: TissueStatus,
}

impl RegenerativeBlastema {
    pub fn new(module_id: String, base_checkpoint_hash: String) -> Self {
        Self {
            module_id,
            base_checkpoint_hash,
            status: TissueStatus::Healthy,
        }
    }

    /// Amputates the corrupted module and forms a blastema (Regenerating state)
    pub fn amputate_and_form_blastema(&mut self) -> Result<(), String> {
        if self.status == TissueStatus::Corrupted {
            self.status = TissueStatus::Regenerating;
            Ok(())
        } else {
            Err("Only corrupted tissues can be amputated to form a blastema.".to_string())
        }
    }

    /// Completes the regeneration process from the base checkpoint
    pub fn complete_regeneration(&mut self, restored_hash: String) -> Result<String, String> {
        if self.status == TissueStatus::Regenerating {
            self.status = TissueStatus::Healthy;
            Ok(restored_hash)
        } else {
            Err("Tissue is not in a Regenerating state.".to_string())
        }
    }
}
