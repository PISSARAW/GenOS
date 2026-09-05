pub use genos_signal::{ExtracellularMatrix, Ligand, Receptor, SignalingMode, TerritoryClaim};
use crate::cell::AgentCell;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CellularMessenger {
    pub sender_id: uuid::Uuid,
    pub ligand: Ligand,
}

impl CellularMessenger {
    pub fn new(sender: &AgentCell, ligand: Ligand) -> Self {
        Self {
            sender_id: sender.cell_id,
            ligand,
        }
    }

    pub fn transmit_to(&self, recipient: &mut AgentCell) -> bool {
        if recipient.is_alive() {
            recipient.conscience.dissonance_level =
                (recipient.conscience.dissonance_level - 0.1).max(0.0);
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cellular_messaging_flow() {
        let cell_a = AgentCell::default();
        let mut cell_b = AgentCell::default();
        let ligand = Ligand::new("ATP_BOOST", SignalingMode::Paracrine, 2.0);
        let messenger = CellularMessenger::new(&cell_a, ligand);
        assert!(messenger.transmit_to(&mut cell_b));
    }

    #[test]
    fn test_matrix_territory_inhibition() {
        let mut ecm = ExtracellularMatrix::new();
        let cell_a = AgentCell::default();
        let cell_b = AgentCell::default();
        assert!(ecm
            .claim_territory(TerritoryClaim {
                cell_id: cell_a.cell_id,
                filepath: "genome.rs",
                position: 0,
            })
            .is_ok());
        assert!(ecm
            .claim_territory(TerritoryClaim {
                cell_id: cell_b.cell_id,
                filepath: "genome.rs",
                position: 1,
            })
            .is_err());
        assert!(ecm.release_territory(cell_a.cell_id, "genome.rs"));
        assert!(ecm
            .claim_territory(TerritoryClaim {
                cell_id: cell_b.cell_id,
                filepath: "genome.rs",
                position: 1,
            })
            .is_ok());
    }
}
