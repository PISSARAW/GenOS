//! Banque de plasmides : compétences transférables par transfert horizontal.

use genos_biology::specialized_cells::prokaryote::{HgtTransferReport, Plasmid, ProkaryoticAgent};

/// Compétences exécutables portées par un plasmide.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Skill {
    Repair,
    Throttle,
    Heal,
    Verify,
}

impl Skill {
    pub fn code(self) -> &'static str {
        match self {
            Skill::Repair => "SKILL_REPAIR",
            Skill::Throttle => "SKILL_THROTTLE",
            Skill::Heal => "SKILL_HEAL",
            Skill::Verify => "SKILL_VERIFY",
        }
    }

    pub fn parse(code: &str) -> Option<Skill> {
        match code {
            "SKILL_REPAIR" => Some(Skill::Repair),
            "SKILL_THROTTLE" => Some(Skill::Throttle),
            "SKILL_HEAL" => Some(Skill::Heal),
            "SKILL_VERIFY" => Some(Skill::Verify),
            _ => None,
        }
    }
}

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

    /// Plasmide standard porteur d'une compétence exécutable.
    pub fn for_skill(skill: Skill) -> Plasmid {
        Plasmid {
            plasmid_id: format!("pl_{}", skill.code().to_lowercase()),
            skill_name: skill.code().to_string(),
            executable_payload: skill.code().to_string(),
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
