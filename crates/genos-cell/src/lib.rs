use serde::{Deserialize, Serialize};
use uuid::Uuid;
pub mod conscience;
pub use conscience::ConscienceState;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Organelle {
    Mitochondrion {
        id: Uuid,
        atp_budget: u64,
        efficiency: f64,
    },
    Ribosome {
        id: Uuid,
        translation_capacity: u32,
    },
    Chloroplast {
        id: Uuid,
        energy_yield: u64,
    },
    Lysosome {
        id: Uuid,
        digestion_capacity: u32,
    },
    Endosymbiont {
        original_id: Uuid,
        role: String,
        internal_state: Box<AgentCell>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    pub cell_id: Uuid,
    pub name: String,
    pub name_meaning: String,
    pub role: String,
    pub conscience: ConscienceState,
    pub organelles: Vec<Organelle>,
}

impl Default for AgentCell {
    fn default() -> Self {
        let african_names = [
            ("Kwame", "Né un samedi (Akan) - Le planificateur méthodique"),
            ("Chidi", "Dieu existe (Igbo) - L'esprit logique et rigoureux"),
            ("Zola", "Calme et amour (Kongo) - Le pacificateur et conciliateur"),
            ("Nia", "Objectif et dessein (Swahili) - La détermination inflexible"),
            ("Tariq", "L'étoile du matin (Arabe / Nord-Africain) - L'éclaireur avant-gardiste"),
            ("Ayo", "Pleine de joie (Yoruba) - La créativité vivace"),
            ("Griot", "Le dépositaire de la tradition orale et des savoirs de GenOS"),
        ];
        let time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_nanos();
        let idx = (time as usize) % african_names.len();
        let (name, meaning) = african_names[idx];

        Self {
            cell_id: Uuid::new_v4(),
            name: name.to_string(),
            name_meaning: meaning.to_string(),
            role: "Autonomous Node".to_string(),
            conscience: ConscienceState::default(),
            organelles: Vec::new(),
        }
    }
}

impl AgentCell {
    pub const MAX_ORGANELLES: usize = 16;
    pub fn new(name: impl Into<String>, name_meaning: impl Into<String>, role: impl Into<String>) -> Self {
        Self {
            cell_id: Uuid::new_v4(),
            name: name.into(),
            name_meaning: name_meaning.into(),
            role: role.into(),
            conscience: ConscienceState::default(),
            organelles: Vec::new(),
        }
    }

    pub fn introduce_self(&self) -> String {
        format!(
            "Je m'appelle {}, ce qui signifie '{}'. C'est l'identité et le sens que je porte dans l'écosystème GenOS en tant que {}.",
            self.name, self.name_meaning, self.role
        )
    }

    pub fn can_phagocytize(&self, symbiont_id: Uuid) -> Result<(), String> {
        if self.cell_id == symbiont_id {
            return Err("A cell cannot phagocytize itself".to_string());
        }
        if self.organelles.len() >= Self::MAX_ORGANELLES {
            return Err("Organelle capacity exhausted".to_string());
        }
        if self.organelles.iter().any(|organelle| match organelle {
            Organelle::Endosymbiont { original_id, .. } => *original_id == symbiont_id,
            Organelle::Mitochondrion { id, .. }
            | Organelle::Ribosome { id, .. }
            | Organelle::Chloroplast { id, .. }
            | Organelle::Lysosome { id, .. } => *id == symbiont_id,
        }) {
            return Err("Symbiont is already integrated".to_string());
        }
        Ok(())
    }

    pub fn phagocytize(&mut self, symbiont: AgentCell) -> Result<(), String> {
        self.can_phagocytize(symbiont.cell_id)?;
        let organelle = Organelle::Endosymbiont {
            original_id: symbiont.cell_id,
            role: symbiont.role.clone(),
            internal_state: Box::new(symbiont),
        };
        self.organelles.push(organelle);
        Ok(())
    }

    pub fn organelle_count(&self) -> usize {
        self.organelles.len()
    }

    pub fn is_alive(&self) -> bool {
        !self.conscience.is_apoptotic
    }

    pub fn binary_fission(&self, _mutation_rate: f64) -> Result<(Self, Self), String> {
        let mut clone = self.clone();
        clone.cell_id = Uuid::new_v4();
        Ok((self.clone(), clone))
    }

    pub fn trigger_apoptosis(&mut self) {
        if self.conscience.is_apoptotic {
            return;
        }
        self.conscience.is_apoptotic = true;
        self.conscience.current_budget = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_cell_identity_and_conscience() {
        let agent = AgentCell::new("Kwame", "Le planificateur méthodique", "Architecte");
        assert_eq!(agent.name, "Kwame");
        assert_eq!(agent.name_meaning, "Le planificateur méthodique");
        assert!(agent.introduce_self().contains("Kwame"));
        assert!(agent.introduce_self().contains("Le planificateur méthodique"));
        assert!(agent.is_alive());
        assert_eq!(agent.conscience.dissonance_level, 0.0);
    }

    #[test]
    fn test_typed_organelles_are_serializable_state() {
        let mut agent = AgentCell::new("Host", "Host cell", "Worker");
        agent.organelles.push(Organelle::Mitochondrion {
            id: Uuid::new_v4(),
            atp_budget: 36,
            efficiency: 0.94,
        });
        agent.organelles.push(Organelle::Ribosome {
            id: Uuid::new_v4(),
            translation_capacity: 12,
        });
        let encoded = serde_json::to_string(&agent).expect("cell must serialize");
        let decoded: AgentCell = serde_json::from_str(&encoded).expect("cell must deserialize");
        assert_eq!(decoded.organelle_count(), 2);
    }
}
