//! Cascade de signalisation : ligands, récepteurs, transmission cellulaire.

use genos_biology::signaling::CellularMessenger;
use genos_cell::AgentCell;
use genos_signal::{ExtracellularMatrix, Ligand, ParacrineSignal, Receptor, SignalingMode};

/// Cascade locale : ligands émis et récepteurs exprimés.
#[derive(Default)]
pub struct SignalingCascade {
    pub ligands: Vec<Ligand>,
    pub receptors: Vec<Receptor>,
}

impl SignalingCascade {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn emit(&mut self, ligand: Ligand) -> usize {
        self.ligands.push(ligand);
        self.ligands.len() - 1
    }

    pub fn express_receptor(
        &mut self,
        target_ligand: &str,
        cascade_signal: &str,
        threshold: f64,
    ) -> usize {
        self.receptors
            .push(Receptor::new(target_ligand, cascade_signal, threshold));
        self.receptors.len() - 1
    }

    /// Transduction : le ligand émis déclenche-t-il un récepteur ?
    pub fn transduce(&self, ligand_index: usize) -> Option<String> {
        let ligand = self.ligands.get(ligand_index)?;
        self.receptors
            .iter()
            .find_map(|receptor| receptor.receive(ligand).map(str::to_string))
    }

    /// Transmission juxtacrine/paracrine directe entre deux cellules.
    pub fn transmit(sender: &AgentCell, ligand: Ligand, recipient: &mut AgentCell) -> bool {
        CellularMessenger::new(sender, ligand).transmit_to(recipient)
    }

    /// Émission d'un signal paracrine dans la matrice extracellulaire.
    pub fn emit_paracrine(
        matrix: &mut ExtracellularMatrix,
        source_idx: usize,
        ligand: Ligand,
        ttl: u32,
    ) {
        matrix.emit_signal(ParacrineSignal {
            source_idx,
            ligand,
            ttl,
        });
    }

    /// Construit un ligand de mode donné.
    pub fn ligand(name: &str, mode: SignalingMode, concentration: f64) -> Ligand {
        Ligand::new(name, mode, concentration)
    }
}
