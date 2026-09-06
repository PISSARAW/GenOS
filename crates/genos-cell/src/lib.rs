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

pub const DEFAULT_HAYFLICK_LIMIT: u32 = 50;

fn default_hayflick_limit() -> u32 {
    DEFAULT_HAYFLICK_LIMIT
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    pub cell_id: Uuid,
    pub name: String,
    pub name_meaning: String,
    pub role: String,
    pub conscience: ConscienceState,
    pub organelles: Vec<Organelle>,
    #[serde(default)]
    pub bud_scars: u32,
    #[serde(default = "default_hayflick_limit")]
    pub hayflick_limit: u32,
    #[serde(default)]
    pub is_senescent: bool,
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
            bud_scars: 0,
            hayflick_limit: DEFAULT_HAYFLICK_LIMIT,
            is_senescent: false,
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
            bud_scars: 0,
            hayflick_limit: DEFAULT_HAYFLICK_LIMIT,
            is_senescent: false,
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

    fn regenerate_organelle_ids(&mut self) {
        for organelle in &mut self.organelles {
            match organelle {
                Organelle::Mitochondrion { id, .. }
                | Organelle::Ribosome { id, .. }
                | Organelle::Chloroplast { id, .. }
                | Organelle::Lysosome { id, .. } => *id = Uuid::new_v4(),
                Organelle::Endosymbiont { original_id, internal_state, .. } => {
                    *original_id = Uuid::new_v4();
                    internal_state.cell_id = *original_id;
                    internal_state.regenerate_organelle_ids();
                }
            }
        }
    }

    pub fn can_divide(&self) -> Result<(), String> {
        if self.conscience.is_apoptotic {
            return Err("Apoptotic cell cannot divide".to_string());
        }
        if self.is_senescent || self.bud_scars >= self.hayflick_limit {
            return Err("Hayflick limit reached: cell has reached replicative senescence".to_string());
        }
        Ok(())
    }

    pub fn remaining_divisions(&self) -> u32 {
        self.hayflick_limit.saturating_sub(self.bud_scars)
    }

    pub fn apply_telomerase(&mut self) {
        self.bud_scars = 0;
        self.is_senescent = false;
    }

    pub fn budding(&mut self, daughter_volume: f64) -> Result<AgentCell, String> {
        if daughter_volume <= 0.0 || daughter_volume >= 1.0 {
            return Err("Daughter volume must be between 0 and 1".to_string());
        }
        self.can_divide()?;

        self.bud_scars += 1;
        if self.bud_scars >= self.hayflick_limit {
            self.is_senescent = true;
        }

        let mother_budget = self.conscience.current_budget;
        let daughter_budget = (mother_budget * daughter_volume).max(0.0);
        self.conscience.current_budget = (mother_budget * (1.0 - daughter_volume)).max(0.0);

        let mut daughter = self.clone();
        daughter.cell_id = Uuid::new_v4();
        daughter.name = format!("{}_bud_{}", self.name, self.bud_scars);
        daughter.role = format!("Ephemeral Bud of {}", self.role);
        daughter.bud_scars = 0;
        daughter.is_senescent = false;
        // Daughter inherits a constrained Hayflick limit to prevent recursive spawn storms
        daughter.hayflick_limit = (self.hayflick_limit / 2).max(1);
        daughter.conscience.current_budget = daughter_budget;
        daughter.conscience.baseline_budget = daughter_budget;
        daughter.regenerate_organelle_ids();

        Ok(daughter)
    }

    pub fn binary_fission(&self, mutation_rate: f64) -> Result<(Self, Self), String> {
        if !(0.0..=1.0).contains(&mutation_rate) {
            return Err("Mutation rate must be between 0 and 1".to_string());
        }
        self.can_divide()?;
        let half_budget = (self.conscience.current_budget / 2.0).max(0.0);

        let mut daughter_a = self.clone();
        daughter_a.conscience.current_budget = half_budget;
        daughter_a.bud_scars += 1;
        if daughter_a.bud_scars >= daughter_a.hayflick_limit {
            daughter_a.is_senescent = true;
        }

        let mut daughter_b = self.clone();
        daughter_b.cell_id = Uuid::new_v4();
        daughter_b.conscience.current_budget = half_budget;
        daughter_b.bud_scars = daughter_a.bud_scars;
        daughter_b.is_senescent = daughter_a.is_senescent;
        daughter_b.regenerate_organelle_ids();

        Ok((daughter_a, daughter_b))
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

    #[test]
    fn test_binary_fission_budget_division_and_organelle_uniqueness() {
        let mut parent = AgentCell::new("ParentCell", "Prokaryote model", "Worker");
        parent.conscience.current_budget = 80.0;
        let organelle_id = Uuid::new_v4();
        parent.organelles.push(Organelle::Ribosome {
            id: organelle_id,
            translation_capacity: 10,
        });

        let (daughter_a, daughter_b) = parent.binary_fission(0.05).expect("fission must succeed");
        assert_eq!(daughter_a.cell_id, parent.cell_id);
        assert_ne!(daughter_b.cell_id, parent.cell_id);

        // Budget conservation
        assert_eq!(daughter_a.conscience.current_budget, 40.0);
        assert_eq!(daughter_b.conscience.current_budget, 40.0);
        assert_eq!(daughter_a.conscience.current_budget + daughter_b.conscience.current_budget, parent.conscience.current_budget);

        // Organelle ID uniqueness
        match (&daughter_a.organelles[0], &daughter_b.organelles[0]) {
            (Organelle::Ribosome { id: id_a, .. }, Organelle::Ribosome { id: id_b, .. }) => {
                assert_eq!(*id_a, organelle_id);
                assert_ne!(*id_b, organelle_id);
                assert_ne!(*id_a, *id_b);
            }
            _ => panic!("Expected Ribosome organelle"),
        }

        // Invalid mutation rates
        assert!(parent.binary_fission(-0.1).is_err());
        assert!(parent.binary_fission(1.1).is_err());
    }

    #[test]
    fn test_agent_cell_budding_and_hayflick_limit() {
        let mut mother = AgentCell::new("MotherYeast", "Asymmetric budding organism", "ParentWorker");
        mother.conscience.current_budget = 100.0;
        mother.hayflick_limit = 3; // Small limit for testing

        assert_eq!(mother.bud_scars, 0);
        assert_eq!(mother.remaining_divisions(), 3);
        assert!(!mother.is_senescent);

        // Bud 1
        let bud1 = mother.budding(0.3).expect("first bud should succeed");
        assert_eq!(mother.bud_scars, 1);
        assert_eq!(mother.remaining_divisions(), 2);
        assert_eq!(mother.conscience.current_budget, 70.0);
        assert_eq!(bud1.conscience.current_budget, 30.0);
        assert_eq!(bud1.bud_scars, 0);
        assert!(bud1.role.contains("Ephemeral Bud"));

        // Bud 2
        let _bud2 = mother.budding(0.5).expect("second bud should succeed");
        assert_eq!(mother.bud_scars, 2);
        assert_eq!(mother.remaining_divisions(), 1);

        // Bud 3 (reaches limit)
        let _bud3 = mother.budding(0.5).expect("third bud reaches limit");
        assert_eq!(mother.bud_scars, 3);
        assert_eq!(mother.remaining_divisions(), 0);
        assert!(mother.is_senescent);

        // Bud 4 (exceeds limit -> error)
        let err = mother.budding(0.5);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("Hayflick limit reached"));

        // Telomerase restores division potential
        mother.apply_telomerase();
        assert_eq!(mother.bud_scars, 0);
        assert!(!mother.is_senescent);
        assert_eq!(mother.remaining_divisions(), 3);
        assert!(mother.budding(0.2).is_ok());
    }
}

