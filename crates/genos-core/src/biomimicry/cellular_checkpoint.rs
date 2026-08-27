//! Cellular Checkpoint for resolving business ambiguity.
//! Freezes the execution thread until a strict chemical signal
//! (forced binary choice) is provided by the user or upper agent.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChemicalSignal {
    pub option_a: String,
    pub option_b: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CheckpointState {
    Active { ambiguity: String, signal: ChemicalSignal },
    Resolved { choice: String },
}

#[derive(Debug, Clone)]
pub struct CellularCheckpoint {
    pub state: CheckpointState,
}

impl CellularCheckpoint {
    pub fn freeze_and_request(ambiguity: String, opt_a: String, opt_b: String) -> Self {
        CellularCheckpoint {
            state: CheckpointState::Active {
                ambiguity,
                signal: ChemicalSignal {
                    option_a: opt_a,
                    option_b: opt_b,
                },
            },
        }
    }

    pub fn provide_signal(&mut self, choice: String) -> Result<String, String> {
        if let CheckpointState::Active { signal, .. } = &self.state {
            if choice == signal.option_a || choice == signal.option_b {
                self.state = CheckpointState::Resolved { choice: choice.clone() };
                Ok(choice)
            } else {
                Err("Signal must strictly match one of the binary options".to_string())
            }
        } else {
            Err("Checkpoint is already resolved".to_string())
        }
    }
}
