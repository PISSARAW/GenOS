use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SignalingMode {
    /// 1. Contact direct (Jonctions communicantes)
    Juxtacrine,
    /// 2. Courte distance (Diffusion locale)
    Paracrine,
    /// 3. Longue distance (Réseau sanguin)
    Endocrine,
    /// 4. Auto-stimulation (Post-it sur le frigo)
    Autocrine,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ligand {
    /// La "Clé" (Ex: Adrénaline, Cytokine, EGF)
    pub name: String,
    pub mode: SignalingMode,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Receptor {
    /// La "Serrure" (La forme de la clé acceptée)
    pub target_ligand: String,
    /// Le message relayé au noyau lors du déverrouillage (Cascade)
    pub internal_cascade_signal: String,
}

impl Receptor {
    pub fn new(target_ligand: &str, internal_cascade_signal: &str) -> Self {
        Self {
            target_ligand: target_ligand.to_string(),
            internal_cascade_signal: internal_cascade_signal.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::AgentCell;
    use crate::signaling::{Ligand, Receptor, SignalingMode};

    #[test]
    fn test_cellular_communication_modes() {
        let mut heart_cell_1 = AgentCell::default();
        let mut heart_cell_2 = AgentCell::default();
        let mut muscle_cell = AgentCell::default();
        let mut cancer_cell = AgentCell::default();
        let mut white_blood_cell = AgentCell::default();

        // Ajout des serrures (Récepteurs) sur la membrane des cellules
        heart_cell_2.plasma_membrane.receptors.push(Receptor::new("ELECTRIC_PULSE", "HEART_CONTRACTION_SYNC"));
        
        muscle_cell.plasma_membrane.receptors.push(Receptor::new("ADRENALINE", "ADRENALINE_CASCADE"));
        heart_cell_1.plasma_membrane.receptors.push(Receptor::new("ADRENALINE", "ADRENALINE_CASCADE"));
        heart_cell_2.plasma_membrane.receptors.push(Receptor::new("ADRENALINE", "ADRENALINE_CASCADE"));
        
        white_blood_cell.plasma_membrane.receptors.push(Receptor::new("CYTOKINE_ALARM", "IMMUNE_RESPONSE_TF"));
        
        cancer_cell.plasma_membrane.receptors.push(Receptor::new("GROWTH_FACTOR", "GROWTH_CASCADE"));


        // --- 1. JUXTACRINE (Contact Direct / Passage Secret) ---
        // heart_cell_1 et heart_cell_2 se touchent (Gap Junction)
        heart_cell_1.plasma_membrane.gap_junctions.push(heart_cell_2.cell_id);
        heart_cell_2.plasma_membrane.gap_junctions.push(heart_cell_1.cell_id);

        let pulse = Ligand { name: "ELECTRIC_PULSE".to_string(), mode: SignalingMode::Juxtacrine };
        // Simulation : heart_cell_1 passe le signal directement via la gap junction à heart_cell_2
        assert!(heart_cell_2.receive_ligand(&pulse));
        assert!(heart_cell_2.nucleus.transcription_factors.contains(&"CONTRACTION_TF".to_string()));


        // --- 2. PARACRINE (Porte-voix de quartier) ---
        // Une cellule infectée crie à l'aide dans son voisinage local
        let infection_alert = Ligand { name: "CYTOKINE_ALARM".to_string(), mode: SignalingMode::Paracrine };
        assert!(white_blood_cell.receive_ligand(&infection_alert));
        assert!(white_blood_cell.nucleus.transcription_factors.contains(&"IMMUNE_RESPONSE_TF".to_string()));


        // --- 3. ENDOCRINE (Réseau Sanguin) ---
        // Le cerveau relâche de l'adrénaline dans le sang
        let adrenaline = Ligand { name: "ADRENALINE".to_string(), mode: SignalingMode::Endocrine };
        
        // TOUTES les cellules du sang reçoivent la clé, mais seules celles avec la serrure s'activent
        assert!(heart_cell_1.receive_ligand(&adrenaline));
        assert!(muscle_cell.receive_ligand(&adrenaline));
        assert!(!white_blood_cell.receive_ligand(&adrenaline)); // Pas de récepteur adrénaline !

        assert!(muscle_cell.nucleus.transcription_factors.contains(&"FIGHT_FLIGHT_TF".to_string()));


        // --- 4. AUTOCRINE (Auto-stimulation / Cancer) ---
        // La cellule cancéreuse relâche un facteur de croissance et l'absorbe elle-même
        cancer_cell.emit_autocrine("GROWTH_FACTOR");
        assert!(cancer_cell.nucleus.transcription_factors.contains(&"CELL_DIVISION_TF".to_string()));
    }
}

