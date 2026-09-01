use crate::cell::AgentCell;
use crate::genome::ChromatinState;
use std::collections::BTreeMap;

/// ACTE 1 : Le Zygote et la Mitose
/// Génère un essaim d''agents "Cellules Souches" identiques à partir d''une racine unique.
pub fn cleave_zygote(zygote: AgentCell, divisions: u32) -> Vec<AgentCell> {
    let mut swarm = vec![zygote];
    for _ in 0..divisions {
        let mut new_generation = Vec::new();
        for cell in &mut swarm {
            if let Ok((parent, clone)) = cell.clone().binary_fission(0.0) {
                new_generation.push(parent);
                new_generation.push(clone);
            }
        }
        swarm = new_generation;
    }
    // À ce stade, toutes les cellules sont Totipotentes (Euchromatine totale)
    swarm
}

/// ACTE 2 & 3 : Le GPS Paracrine (Gènes HOX) et la Différenciation Épigénétique
/// L''Orchestrateur applique un gradient chimique. Selon sa position (index),
/// la cellule active un Gène Architecte (HOX) et cadenasse le reste (Hétérochromatine).
pub fn differentiate_swarm(swarm: &mut Vec<AgentCell>, topology_gradient: f64) {
    let total = swarm.len();
    for (i, cell) in swarm.iter_mut().enumerate() {
        let position_ratio = i as f64 / total as f64;
        
        // Gènes HOX : Le GPS définit le métier (Front-End, Back-End, Database)
        if position_ratio < topology_gradient / 3.0 {
            // TÊTE de l'embryon : Gène HOX-1 -> Interface Utilisateur (UI)
            cell.specialization = "HOX-1_UI_FRONTEND".to_string();
        } else if position_ratio < (topology_gradient / 3.0) * 2.0 {
            // TRONC de l'embryon : Gène HOX-2 -> Logique Métier (BACKEND)
            cell.specialization = "HOX-2_LOGIC_BACKEND".to_string();
        } else {
            // QUEUE de l'embryon : Gène HOX-3 -> Persistance (DATABASE)
            cell.specialization = "HOX-3_DATA_STORAGE".to_string();
        }

        // L'ACTE 3 : Verrouillage Épigénétique
        // La cellule perd son statut de "Page Blanche" et verrouille les outils inutiles.
        for (locus, gene) in cell.nucleus.genome.genes.iter_mut() {
            if locus.contains("HOX") && !locus.contains(&cell.specialization) {
                gene.chromatin_state = ChromatinState::HeterochromatinFacultative; // Cadenassé
                gene.developmentally_locked = true; // Définitif
            }
        }
    }
}

/// ACTE 4 : Le Sculpteur (Apoptose)
/// Pour dessiner des doigts (ou affiner l''architecture de l''IA), on sacrifie
/// les agents redondants situés dans les "espaces vides".
pub fn sculpt_architecture_via_apoptosis(swarm: &mut Vec<AgentCell>) {
    // Par exemple, on sacrifie 1 cellule sur 3 pour créer des "espaces" (comme entre les doigts)
    for (i, cell) in swarm.iter_mut().enumerate() {
        if i % 3 == 0 {
            cell.trigger_apoptosis();
        }
    }
    // On nettoie les cadavres (Macrophagie)
    swarm.retain(|c| c.is_alive);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cell::AgentCell;

    #[test]
    fn test_embryonic_development() {
        // 1. Zygote -> 16 cellules souches (4 divisions)
        
        let mut zygote = crate::cell::AgentCell {
            cell_id: uuid::Uuid::new_v4(),
            plasma_membrane: crate::cell::substructs::PlasmaMembrane {
                incoming_receptors: std::collections::HashMap::new(),
                adhesion_active: false,
                outgoing_ion_channels: std::collections::HashMap::new(),
                receptors_blocked: false,
                has_cell_wall: false,
                is_gram_positive: false,
                peptidoglycan_thickness: 0.0,
                capsule_present: false,
                flagella_count: 0,
                pili_present: false,
                permeability: 1.0,
                is_ruptured: false,
            },
            nucleus: crate::cell::substructs::Nucleus {
                genome: crate::genome::methods::Genome::new("ZYGOTE"),
                ploidy: 2,
                transcription_factors: Vec::new(),
                p53_active: true,
            },
            mitochondria: crate::cell::organelles::Mitochondria {
                atp_budget: 1000,
                metabolic_rate: 1.0,
                angiogenesis_blocked: false,
                mitochondrial_dna: crate::genome::DnaStrand::synthesize("CIRCULAR_MTDNA"),
                is_double_membraned: true,
                cyanide_poisoned: false,
                accumulated_free_radicals: 0,
            },
            redundancy: crate::redundancy::RedundancySystem::default(),
            is_alive: true,
            specialization: "UNDEFINED".to_string(),
        };

        let mut swarm = cleave_zygote(zygote, 4);
        assert_eq!(swarm.len(), 16);

        // 2 & 3. Gènes HOX et Différenciation
        differentiate_swarm(&mut swarm, 1.0);
        assert!(swarm[0].specialization.contains("HOX-1")); // Tête
        assert!(swarm[15].specialization.contains("HOX-3")); // Queue

        // 4. Sculpture (Apoptose des "moufles" pour faire des doigts)
        sculpt_architecture_via_apoptosis(&mut swarm);
        assert!(swarm.len() < 16); // La sculpture a éliminé l'excès de glaise
    }
}
