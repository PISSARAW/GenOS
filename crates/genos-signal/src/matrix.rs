use crate::cascade::{Ligand, SignalingMode};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct ParacrineSignal {
    pub source_idx: usize,
    pub ligand: Ligand,
    pub ttl: u32,
}

pub struct TerritoryClaim<'a> {
    pub cell_id: Uuid,
    pub filepath: &'a str,
    pub position: usize,
}

pub struct ExtracellularMatrix {
    pub paracrine_signals: Vec<(usize, Ligand, u32)>,
    pub occupied_territories: HashMap<String, Uuid>,
}

impl Default for ExtracellularMatrix {
    fn default() -> Self {
        Self::new()
    }
}

impl ExtracellularMatrix {
    pub fn new() -> Self {
        Self {
            paracrine_signals: Vec::new(),
            occupied_territories: HashMap::new(),
        }
    }

    pub fn emit_signal(&mut self, signal: ParacrineSignal) {
        self.paracrine_signals.push((signal.source_idx, signal.ligand, signal.ttl));
    }

    pub fn claim_territory(&mut self, claim: TerritoryClaim) -> Result<(), String> {
        let cell_id = claim.cell_id;
        let filepath = claim.filepath;
        let position = claim.position;
        if let Some(&occupant) = self.occupied_territories.get(filepath) {
            if occupant != cell_id {
                return Err(format!(
                    "Contact inhibition: territory '{}' occupied by {}",
                    filepath, occupant
                ));
            }
        }
        self.occupied_territories.insert(filepath.to_string(), cell_id);
        let quorum_ligand =
            Ligand::new(&format!("QUORUM_{}", filepath), SignalingMode::Paracrine, 1.0);
        self.emit_signal(ParacrineSignal {
            source_idx: position,
            ligand: quorum_ligand,
            ttl: 3,
        });
        Ok(())
    }

    pub fn release_territory(&mut self, cell_id: Uuid, filepath: &str) -> bool {
        if let Some(&occupant) = self.occupied_territories.get(filepath) {
            if occupant == cell_id {
                self.occupied_territories.remove(filepath);
                return true;
            }
        }
        false
    }

    pub fn decay_signals(&mut self) {
        self.paracrine_signals.retain_mut(|(_, _, ttl)| {
            if *ttl > 0 {
                *ttl -= 1;
                *ttl > 0
            } else {
                false
            }
        });
    }
}
