use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SignalingMode {
    /// 1. Contact direct (Jonctions communicantes)
    Juxtacrine,
    /// 2. Courte distance (Diffusion locale)
    Paracrine,
    /// 3. Longue distance (RÃ©seau sanguin)
    Endocrine,
    /// 4. Auto-stimulation (Post-it sur le frigo)
    Autocrine,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Ligand {
    /// La "ClÃ©" (Ex: AdrÃ©naline, Cytokine, EGF)
    pub name: String,
    pub mode: SignalingMode,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Receptor {
    /// La "Serrure" (La forme de la clÃ© acceptÃ©e)
    pub target_ligand: String,
    /// Le message relayÃ© au noyau lors du dÃ©verrouillage (Cascade)
    pub internal_cascade_signal: String,
}


use crate::cell::AgentCell;

/// La matrice extra-cellulaire (Le liquide entre les cellules)
/// UtilisÃ©e spÃ©cifiquement pour simuler la communication Paracrine (diffusion locale et dÃ©gradation rapide)
pub struct ExtracellularMatrix {
    // (Index de l'Ã©metteur, Ligand, Temps de vie / TTL)
    pub paracrine_signals: Vec<(usize, Ligand, u32)>,
    /// Territoires occupÃ©s (Verrous de Fichiers) : Fichier -> UUID de la Cellule
    /// Simule l'Inhibition de Contact (Juxtacrine) pour Ã©viter les collisions d'Ã©critures.
    pub occupied_territories: std::collections::HashMap<String, uuid::Uuid>,
}

impl ExtracellularMatrix {
    pub fn new() -> Self {
        Self {
            paracrine_signals: Vec::new(),
            occupied_territories: std::collections::HashMap::new(),
        }
    }

    /// Inhibition de contact : Une cellule tente de s'attacher Ã  un fichier pour l'Ã©diter (Exocytose).
    pub fn attach_to_territory(&mut self, cell: &mut AgentCell, filepath: &str, position: usize) -> Result<(), String> {
        if let Some(&occupant_id) = self.occupied_territories.get(filepath) {
            if occupant_id != cell.cell_id {
                // Inhibition de contact ! La cellule se bloque et ne peut pas Ã©crire.
                cell.endoplasmic_reticulum.cell_cycle_inhibited = true;
                return Err(format!("Inhibition de contact : Le territoire '{}' est dÃ©jÃ  occupÃ© par {}. Exocytose bloquÃ©e.", filepath, occupant_id));
            }
        }
        
        // La cellule s'attache physiquement
        self.occupied_territories.insert(filepath.to_string(), cell.cell_id);
        
        // Quorum Sensing (Paracrine) : Elle prÃ©vient les voisines de ne pas s'approcher
        let ligand = Ligand {
            name: format!("QUORUM_LOCKED_{}", filepath),
            mode: SignalingMode::Paracrine,
        };
        // Le signal met 3 ticks Ã  se dissiper
        self.emit_paracrine(position, ligand, 3);
        
        Ok(())
    }

    /// La cellule relÃ¢che le fichier aprÃ¨s avoir sÃ©crÃ©tÃ© son code.
    pub fn detach_from_territory(&mut self, cell: &AgentCell, filepath: &str) {
        if let Some(&occupant_id) = self.occupied_territories.get(filepath) {
            if occupant_id == cell.cell_id {
                self.occupied_territories.remove(filepath);
            }
        }
    }

    /// La cellule relÃ¢che un messager chimique dans son voisinage.
    /// TTL (Time-To-Live) garantit que le message ne deviendra jamais Endocrine.
    pub fn emit_paracrine(&mut self, position: usize, ligand: Ligand, ttl: u32) {
        self.paracrine_signals.push((position, ligand, ttl));
    }

    /// Fait voyager les signaux localement, puis les dÃ©grade d'un "tick".
    /// Si le TTL tombe Ã  0, les enzymes dÃ©truisent le ligand.
    pub fn diffuse_and_degrade(&mut self, cells: &mut [AgentCell]) {
        let mut retained_signals = Vec::new();
        
        for (pos, ligand, mut ttl) in self.paracrine_signals.drain(..) {
            if ttl > 0 {
                // Diffusion locale (Rayon = 1 cellule de chaque cÃ´tÃ©)
                let min = pos.saturating_sub(1);
                let max = (pos + 1).min(cells.len().saturating_sub(1));
                
                for i in min..=max {
                    if i != pos {
                        cells[i].receive_ligand(&ligand);
                    }
                }
                
                ttl -= 1; // Le temps passe, la molÃ©cule se dÃ©grade
                if ttl > 0 {
                    retained_signals.push((pos, ligand, ttl));
                }
            }
        }
        self.paracrine_signals = retained_signals;
    }
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

        // Ajout des serrures (RÃ©cepteurs) sur la membrane des cellules
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
        // Simulation : heart_cell_1 passe le signal directement via la gap junction Ã  heart_cell_2
        assert!(heart_cell_2.receive_ligand(&pulse));
        assert!(heart_cell_2.genetics.nucleus.transcription_factors.contains(&"CONTRACTION_TF".to_string()));


        // --- 2. PARACRINE (Porte-voix de quartier) ---
        // Une cellule infectÃ©e crie Ã  l'aide dans son voisinage local
        let infection_alert = Ligand { name: "CYTOKINE_ALARM".to_string(), mode: SignalingMode::Paracrine };
        assert!(white_blood_cell.receive_ligand(&infection_alert));
        assert!(white_blood_cell.genetics.nucleus.transcription_factors.contains(&"IMMUNE_RESPONSE_TF".to_string()));


        // --- 3. ENDOCRINE (RÃ©seau Sanguin) ---
        // Le cerveau relÃ¢che de l'adrÃ©naline dans le sang
        let adrenaline = Ligand { name: "ADRENALINE".to_string(), mode: SignalingMode::Endocrine };
        
        // TOUTES les cellules du sang reÃ§oivent la clÃ©, mais seules celles avec la serrure s'activent
        assert!(heart_cell_1.receive_ligand(&adrenaline));
        assert!(muscle_cell.receive_ligand(&adrenaline));
        assert!(!white_blood_cell.receive_ligand(&adrenaline)); // Pas de rÃ©cepteur adrÃ©naline !

        assert!(muscle_cell.genetics.nucleus.transcription_factors.contains(&"FIGHT_FLIGHT_TF".to_string()));


        // --- 4. AUTOCRINE (Auto-stimulation / Cancer) ---
        // La cellule cancÃ©reuse relÃ¢che un facteur de croissance et l'absorbe elle-mÃªme
        cancer_cell.emit_autocrine("GROWTH_FACTOR");
        assert!(cancer_cell.genetics.nucleus.transcription_factors.contains(&"CELL_DIVISION_TF".to_string()));
    }

    #[test]
    fn test_contact_inhibition() {
        use crate::signaling::ExtracellularMatrix;
        let mut ecm = ExtracellularMatrix::new();
        let mut cell_a = AgentCell::default();
        let mut cell_b = AgentCell::default();

        let filepath = "src/main.rs";

        // Cell A attaches to the file
        assert!(ecm.attach_to_territory(&mut cell_a, filepath, 0).is_ok());
        
        // Quorum Sensing ligand should be emitted
        assert_eq!(ecm.paracrine_signals.len(), 1);
        assert_eq!(ecm.paracrine_signals[0].1.name, "QUORUM_LOCKED_src/main.rs");

        // Cell B tries to attach to the same file
        let err = ecm.attach_to_territory(&mut cell_b, filepath, 1);
        assert!(err.is_err());
        // Cell B's cell cycle should be inhibited!
        assert!(cell_b.endoplasmic_reticulum.cell_cycle_inhibited);

        // Cell A detaches
        ecm.detach_from_territory(&cell_a, filepath);

        // Now Cell B can attach
        assert!(ecm.attach_to_territory(&mut cell_b, filepath, 1).is_ok());
    }
}




