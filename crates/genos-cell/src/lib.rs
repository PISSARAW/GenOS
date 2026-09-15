use serde::{Deserialize, Serialize};
use uuid::Uuid;
pub mod conscience;
pub use conscience::ConscienceState;
pub mod clinical;
pub use clinical::{ClinicalState, DiseaseCategory, Pathology};
pub mod interoception;
pub use interoception::InteroceptionState;
pub mod autopoiesis;
pub use autopoiesis::MetabolicPool;
mod division;

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
    #[serde(default)]
    pub bud_scar_ids: Vec<Uuid>,
    #[serde(default = "default_hayflick_limit")]
    pub hayflick_limit: u32,
    #[serde(default)]
    pub is_senescent: bool,
    #[serde(default)]
    pub is_ephemeral: bool,
    #[serde(default)]
    pub ephemeral_ttl: Option<u32>,
    #[serde(default)]
    pub chromatin_state: Option<String>,
    #[serde(default)]
    pub genome_id: Option<Uuid>,
    #[serde(default)]
    pub clinical: ClinicalState,
    #[serde(default)]
    pub interoception: InteroceptionState,
    #[serde(default)]
    pub metabolism: MetabolicPool,
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
            bud_scar_ids: Vec::new(),
            hayflick_limit: DEFAULT_HAYFLICK_LIMIT,
            is_senescent: false,
            is_ephemeral: false,
            ephemeral_ttl: None,
            chromatin_state: None,
            genome_id: None,
            clinical: ClinicalState::default(),
            interoception: InteroceptionState::default(),
            metabolism: MetabolicPool::default(),
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
            bud_scar_ids: Vec::new(),
            hayflick_limit: DEFAULT_HAYFLICK_LIMIT,
            is_senescent: false,
            is_ephemeral: false,
            ephemeral_ttl: None,
            chromatin_state: None,
            genome_id: None,
            clinical: ClinicalState::default(),
            interoception: InteroceptionState::default(),
            metabolism: MetabolicPool::default(),
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

    /// Applique les effets actifs (biomimétiques coercitifs) des jauges d'intéroception
    pub fn tick_interoception(&mut self) {
        // 1. Dégradation entropique naturelle
        self.metabolism.apply_entropy(1.0); // 1.0 = unité de temps arbitraire

        // 2. Si la cellule a été endommagée par l'entropie, elle tente de se réparer 
        // avec la matière première issue de sa digestion de données
        let repair_cost_atp = self.metabolism.synthesize_repairs();
        
        // 3. Évaluation classique des jauges d'intéroception
        let (penalty, mut cost, incapacitated) = self.interoception.evaluate_active_effects();
        
        // Le coût métabolique global inclut l'effort interne et la réparation autopoïétique
        cost += repair_cost_atp;

        // On reporte cela sur le cortex insulaire si l'entropie est trop forte
        self.interoception.insular_cortex_integrity = 
            (1.0 - self.metabolism.entropy_level).max(0.0);

        if penalty > 0.0 || cost > 0.0 {
            // Apply dissonance penalty and budget cost
            self.conscience.apply_evaluation(penalty, 0.0, cost);
        }
        
        // Mort par entropie absolue ou par jauge écrasée
        if incapacitated || self.metabolism.entropy_level >= 1.0 {
            self.conscience.is_apoptotic = true;
            self.conscience.current_budget = 0.0;
        }
    }
}

#[cfg(test)]
mod tests;

