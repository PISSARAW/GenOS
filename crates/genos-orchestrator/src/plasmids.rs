//! Banque de plasmides : compétences transférables par transfert horizontal.

use genos_biology::specialized_cells::prokaryote::{HgtTransferReport, Plasmid, ProkaryoticAgent};

/// Catalogue de plasmides (gènes de compétence) de l'orchestrateur.
#[derive(Clone, Debug, Default)]
pub struct PlasmidBank {
    pub plasmids: Vec<Plasmid>,
}

impl PlasmidBank {
    pub fn new() -> Self {
        Self::default()
    }

    /// Fabrique un plasmide porteur d'une compétence.
    pub fn skill(id: &str, skill_name: &str, payload: &str) -> Plasmid {
        Plasmid {
            plasmid_id: id.to_string(),
            skill_name: skill_name.to_string(),
            executable_payload: payload.to_string(),
            resistance_marker: "none".to_string(),
            copy_number: 1,
        }
    }

    pub fn add(&mut self, plasmid: Plasmid) -> usize {
        self.plasmids.push(plasmid);
        self.plasmids.len() - 1
    }

    pub fn get(&self, id: &str) -> Option<&Plasmid> {
        self.plasmids.iter().find(|p| p.plasmid_id == id)
    }

    pub fn count(&self) -> usize {
        self.plasmids.len()
    }

    /// Transfert horizontal (conjugaison) d'un plasmide donneur -> receveur.
    pub fn transfer(
        &self,
        donor: &ProkaryoticAgent,
        recipient: &mut ProkaryoticAgent,
        plasmid_id: &str,
    ) -> Result<HgtTransferReport, String> {
        donor.conjugate_transfer_plasmid(recipient, plasmid_id)
    }
}
