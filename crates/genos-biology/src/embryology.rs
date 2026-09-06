use crate::cell::AgentCell;
use crate::genome::{ChromatinState, Gene, Genome};
use std::collections::HashSet;

pub const MAX_ZYGOTE_DIVISIONS: u32 = 16;

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
    for _ in 0..divisions.min(MAX_ZYGOTE_DIVISIONS) {
        let mut new_generation = Vec::new();
        for cell in &mut swarm {
            if let Ok((parent, clone)) = cell.clone().mitosis() {
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

    }

    let active_axes: HashSet<u8> = swarm.iter().filter_map(|cell| hox_axis(&cell.role)).collect();
    for (locus, gene) in genome.genes.iter_mut() {
        if let Some(axis) = hox_axis(locus) {
            if active_axes.contains(&axis) {
                if gene.chromatin_state == ChromatinState::HeterochromatinFacultative {
                    gene.chromatin_state = ChromatinState::Euchromatin;
                    gene.developmentally_locked = false;
                    gene.is_methylated = false;
                }
            } else {
                gene.chromatin_state = ChromatinState::HeterochromatinFacultative;
                gene.developmentally_locked = true;
            }
        }
    }
}

fn hox_axis(value: &str) -> Option<u8> {
    let normalized = value.to_ascii_uppercase();
    if normalized.contains("HOX-1") || normalized.contains("HOX_A1") { return Some(1); }
    if normalized.contains("HOX-2") || normalized.contains("HOX_A2") { return Some(2); }
    if normalized.contains("HOX-3") || normalized.contains("HOX_A3") { return Some(3); }
    None
}

/// ACTE 4 : Le Sculpteur (Apoptose)
pub fn sculpt_architecture_via_apoptosis(swarm: &mut Vec<AgentCell>) {
    let mut role_counts = std::collections::HashMap::new();
    for cell in swarm.iter() {
        *role_counts.entry(cell.role.clone()).or_insert(0usize) += 1;
    }
    for (i, cell) in swarm.iter_mut().enumerate() {
        let count = role_counts.get(&cell.role).copied().unwrap_or(1);
        if i % 3 == 0 && count > 1 {
            cell.trigger_apoptosis();
            if let Some(role_count) = role_counts.get_mut(&cell.role) {
                *role_count -= 1;
            }
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

    #[test]
    fn test_hox_locus_aliases_follow_active_axes() {
        let zygote = AgentCell::new("Zygote", "Origin", "Stem");
        let mut swarm = cleave_zygote(zygote, 2);
        let mut genome = Genome::new("BASE_HOX_INSTRUCTIONS");
        genome.insert_gene(Gene::new("HOX_A1", "UI_PROMPT"));
        genome.insert_gene(Gene::new("HOX-2_LOGIC_BACKEND", "BACKEND_PROMPT"));
        genome.insert_gene(Gene::new("HOX-3_DATA_STORAGE", "STORAGE_PROMPT"));
        differentiate_swarm(&mut swarm, 1.0, &mut genome);
        assert!(genome.genes.values().all(|gene| !gene.developmentally_locked));
    }

    #[test]
    fn test_reactivated_hox_axis_is_demethylated() {
        let zygote = AgentCell::new("Zygote", "Origin", "Stem");
        let mut swarm = cleave_zygote(zygote, 1);
        let mut genome = Genome::new("BASE_HOX_INSTRUCTIONS");
        let mut gene = Gene::new("HOX-1_UI_FRONTEND", "UI_PROMPT");
        gene.chromatin_state = ChromatinState::HeterochromatinFacultative;
        gene.developmentally_locked = true;
        gene.is_methylated = true;
        genome.insert_gene(gene);

        differentiate_swarm(&mut swarm, 1.0, &mut genome);

        let reactivated = genome.genes.get("HOX-1_UI_FRONTEND").unwrap();
        assert_eq!(reactivated.chromatin_state, ChromatinState::Euchromatin);
        assert!(!reactivated.developmentally_locked);
        assert!(!reactivated.is_methylated);
    }

    #[test]
    fn test_apoptosis_preserves_hox_role_coverage() {
        let zygote = AgentCell::new("Zygote", "Origin", "Stem");
        let mut swarm = cleave_zygote(zygote, 2);
        let mut genome = Genome::new("BASE_HOX_INSTRUCTIONS");
        differentiate_swarm(&mut swarm, 1.0, &mut genome);
        let roles: std::collections::HashSet<_> = swarm.iter().map(|cell| cell.role.clone()).collect();
        sculpt_architecture_via_apoptosis(&mut swarm);
        let surviving_roles: std::collections::HashSet<_> = swarm.iter().map(|cell| cell.role.clone()).collect();
        assert_eq!(roles, surviving_roles);
    }

    #[test]
    fn test_zygote_divisions_are_bounded() {
        let zygote = AgentCell::new("Zygote", "Origin", "Stem");
        let swarm = cleave_zygote(zygote, MAX_ZYGOTE_DIVISIONS + 4);
        assert_eq!(swarm.len(), 1usize << MAX_ZYGOTE_DIVISIONS);
    }
}
