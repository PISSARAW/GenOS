use serde::{Deserialize, Serialize};
use uuid::Uuid;
use genos_orchestrator::conscience::ConscienceState;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    pub cell_id: Uuid,
    pub name: String,
    pub name_meaning: String,
    pub role: String,
    pub conscience: ConscienceState,
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
        }
    }
}

impl AgentCell {
    pub fn new(name: impl Into<String>, name_meaning: impl Into<String>, role: impl Into<String>) -> Self {
        Self {
            cell_id: Uuid::new_v4(),
            name: name.into(),
            name_meaning: name_meaning.into(),
            role: role.into(),
            conscience: ConscienceState::default(),
        }
    }

    pub fn introduce_self(&self) -> String {
        format!(
            "Je m'appelle {}, ce qui signifie '{}'. C'est l'identité et le sens que je porte dans l'écosystème GenOS en tant que {}.",
            self.name, self.name_meaning, self.role
        )
    }

    pub fn is_alive(&self) -> bool {
        !self.conscience.is_apoptotic
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
}
