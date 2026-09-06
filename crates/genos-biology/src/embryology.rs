use crate::cell::AgentCell;
use crate::genome::{ChromatinState, Gene, Genome};

pub fn seed_hox_genome(base_instruction: &str) -> Genome {
    let mut genome = Genome::new(base_instruction);
    genome.insert_gene(Gene::new("HOX-1_UI_FRONTEND", "UI_PROMPT"));
    genome.insert_gene(Gene::new("HOX-2_LOGIC_BACKEND", "BACKEND_PROMPT"));
    genome.insert_gene(Gene::new("HOX-3_DATA_STORAGE", "STORAGE_PROMPT"));
    genome
}

/// ACTE 1 : Le Zygote et la Mitose
/// Génère un essaim d'agents "Cellules Souches" identiques à partir d'une racine unique.
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
    swarm
}

/// ACTE 2 & 3 : Le GPS Paracrine (Gènes HOX) et la Différenciation Épigénétique
pub fn differentiate_swarm(swarm: &mut [AgentCell], topology_gradient: f64, genome: &mut Genome) {
    let total = swarm.len();
    if total == 0 {
        return;
    }
    let gradient = if topology_gradient.is_finite() {
        topology_gradient.clamp(0.0, 1.0)
    } else {
        0.0
    };
    for (i, cell) in swarm.iter_mut().enumerate() {
        let position_ratio = if total == 1 { 0.0 } else { i as f64 / (total - 1) as f64 };

        if position_ratio < gradient / 3.0 {
            cell.role = "HOX-1_UI_FRONTEND".to_string();
        } else if position_ratio < (gradient / 3.0) * 2.0 {
            cell.role = "HOX-2_LOGIC_BACKEND".to_string();
        } else {
            cell.role = "HOX-3_DATA_STORAGE".to_string();
        }

        for (locus, gene) in genome.genes.iter_mut() {
            if locus.contains("HOX") && !locus.contains(&cell.role) {
                gene.chromatin_state = ChromatinState::HeterochromatinFacultative;
                gene.developmentally_locked = true;
            }
        }
    }
}

/// ACTE 4 : Le Sculpteur (Apoptose)
pub fn sculpt_architecture_via_apoptosis(swarm: &mut Vec<AgentCell>) {
    for (i, cell) in swarm.iter_mut().enumerate() {
        if i % 3 == 0 {
            cell.trigger_apoptosis();
        }
    }
    swarm.retain(|c| c.is_alive());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::Gene;

    #[test]
    fn test_embryology_cleavage_and_differentiation() {
        let zygote = AgentCell::new("Zygote", "Origine embryonnaire", "Stem");
        let mut swarm = cleave_zygote(zygote, 2);
        assert_eq!(swarm.len(), 4);

        let mut genome = Genome::new("BASE_HOX_INSTRUCTIONS");
        genome.insert_gene(Gene::new("HOX-1_UI_FRONTEND", "UI_PROMPT"));
        genome.insert_gene(Gene::new("HOX-2_LOGIC_BACKEND", "BACKEND_PROMPT"));

        differentiate_swarm(&mut swarm, 1.0, &mut genome);
        assert!(!swarm[0].role.is_empty());

        sculpt_architecture_via_apoptosis(&mut swarm);
        assert!(swarm.len() < 4);
    }

    #[test]
    fn test_differentiation_covers_hox_axis_and_clamps_gradient() {
        let zygote = AgentCell::new("Zygote", "Origin", "Stem");
        let mut swarm = cleave_zygote(zygote, 2);
        let mut genome = Genome::new("BASE_HOX_INSTRUCTIONS");
        differentiate_swarm(&mut swarm, 2.0, &mut genome);
        assert_eq!(swarm.first().map(|cell| cell.role.as_str()), Some("HOX-1_UI_FRONTEND"));
        assert_eq!(swarm.last().map(|cell| cell.role.as_str()), Some("HOX-3_DATA_STORAGE"));
        assert!(swarm.iter().any(|cell| cell.role == "HOX-2_LOGIC_BACKEND"));

        differentiate_swarm(&mut swarm, f64::NAN, &mut genome);
        assert!(swarm.iter().all(|cell| cell.role == "HOX-3_DATA_STORAGE"));
    }
}
