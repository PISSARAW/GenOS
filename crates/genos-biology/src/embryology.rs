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
            match cell.clone().mitosis() {
                Ok((parent, clone)) => {
                    new_generation.push(parent);
                    new_generation.push(clone);
                }
                Err(_) => {
                    new_generation.push(cell.clone());
                }
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
        cell.chromatin_state = Some("Differentiated".to_string());
        cell.genome_id = Some(genome.genome_id());
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
                gene.is_methylated = true;
            }
        }
    }
}

/// ACTE 3b : Différenciation cellulaire individuelle
/// Différencie le génome d'une cellule individuelle selon son rôle cellulaire spécifique.
/// Les gènes de l'axe actif sont activés (Euchromatine), tandis que les gènes des autres axes
/// sont verrouillés épigénétiquement (Hétérochromatine facultative + méthylation + verrou).
pub fn differentiate_cell_chromatin(role: &str, genome: &mut Genome) {
    let target_axis = hox_axis(role);
    for (locus, gene) in genome.genes.iter_mut() {
        if let Some(axis) = hox_axis(locus) {
            if target_axis == Some(axis) {
                if gene.chromatin_state == ChromatinState::HeterochromatinFacultative {
                    gene.chromatin_state = ChromatinState::Euchromatin;
                    gene.developmentally_locked = false;
                    gene.is_methylated = false;
                }
            } else {
                gene.chromatin_state = ChromatinState::HeterochromatinFacultative;
                gene.developmentally_locked = true;
                gene.is_methylated = true;
            }
        }
    }
}

pub fn differentiate_cell(cell: &mut AgentCell, genome: &mut Genome) {
    differentiate_cell_chromatin(&cell.role, genome);
    cell.chromatin_state = Some("Differentiated".to_string());
    cell.genome_id = Some(genome.genome_id());
}

fn hox_axis(value: &str) -> Option<u8> {
    let normalized = value.to_ascii_uppercase();
    if normalized.contains("HOX-1") || normalized.contains("HOX_A1") { return Some(1); }
    if normalized.contains("HOX-2") || normalized.contains("HOX_A2") { return Some(2); }
    if normalized.contains("HOX-3") || normalized.contains("HOX_A3") { return Some(3); }
    None
}

/// Calcule la viabilité biologique d'une cellule selon son budget métabolique,
/// sa réserve télomérique (Hayflick limit), ses cicatrices de division et sa sénescence.
pub fn calculate_cellular_viability(cell: &AgentCell) -> f64 {
    let senescence_penalty = if cell.is_senescent { -100.0 } else { 0.0 };
    let telomere_reserve = cell.hayflick_limit.saturating_sub(cell.bud_scars) as f64;
    let scar_penalty = (cell.bud_scars as f64) * 2.0;
    let organelle_bonus = (cell.organelles.len() as f64) * 5.0;
    let metabolic_budget = cell.conscience.current_budget;

    metabolic_budget + telomere_reserve * 3.0 + organelle_bonus - scar_penalty + senescence_penalty
}

/// ACTE 4 : Le Sculpteur (Apoptose sélective basée sur la viabilité biologique)
pub fn sculpt_architecture_via_apoptosis(swarm: &mut Vec<AgentCell>) {
    let mut role_indices: std::collections::HashMap<String, Vec<usize>> = std::collections::HashMap::new();
    for (idx, cell) in swarm.iter().enumerate() {
        role_indices.entry(cell.role.clone()).or_default().push(idx);
    }

    // Élagage basé sur la sélection de la cellule la plus viable (fitness métabolique et télomérique)
    for (_role, indices) in role_indices.iter_mut() {
        if indices.len() > 1 {
            // Trier par viabilité décroissante : le meilleur reste en premier
            indices.sort_by(|&a, &b| {
                let score_a = calculate_cellular_viability(&swarm[a]);
                let score_b = calculate_cellular_viability(&swarm[b]);
                score_b.partial_cmp(&score_a).unwrap_or(std::cmp::Ordering::Equal)
            });

            // Déclencher l'apoptose sur toutes les cellules redondantes moins performantes
            for &idx in indices.iter().skip(1) {
                swarm[idx].trigger_apoptosis();
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

    #[test]
    fn test_differentiate_swarm_methylates_locked_genes() {
        let mut swarm = vec![AgentCell::new("Cell1", "Cell1", "HOX-1_UI_FRONTEND")];
        let mut genome = Genome::new("BASE_HOX_INSTRUCTIONS");
        genome.insert_gene(Gene::new("HOX-1_UI_FRONTEND", "UI_PROMPT"));
        genome.insert_gene(Gene::new("HOX-2_LOGIC_BACKEND", "BACKEND_PROMPT"));

        differentiate_swarm(&mut swarm, 0.0, &mut genome);

        let locked_gene = genome.genes.get("HOX-2_LOGIC_BACKEND").unwrap();
        assert_eq!(locked_gene.chromatin_state, ChromatinState::HeterochromatinFacultative);
        assert!(locked_gene.developmentally_locked);
        assert!(locked_gene.is_methylated);
    }

    #[test]
    fn test_differentiate_cell_chromatin_individual() {
        let mut genome = Genome::new("BASE_HOX_INSTRUCTIONS");
        genome.insert_gene(Gene::new("HOX-1_UI_FRONTEND", "UI_PROMPT"));
        genome.insert_gene(Gene::new("HOX-2_LOGIC_BACKEND", "BACKEND_PROMPT"));
        genome.insert_gene(Gene::new("HOX-3_DATA_STORAGE", "STORAGE_PROMPT"));

        differentiate_cell_chromatin("HOX-2_LOGIC_BACKEND", &mut genome);

        let hox1 = genome.genes.get("HOX-1_UI_FRONTEND").unwrap();
        assert_eq!(hox1.chromatin_state, ChromatinState::HeterochromatinFacultative);
        assert!(hox1.developmentally_locked);
        assert!(hox1.is_methylated);

        let hox2 = genome.genes.get("HOX-2_LOGIC_BACKEND").unwrap();
        assert_eq!(hox2.chromatin_state, ChromatinState::Euchromatin);
        assert!(!hox2.developmentally_locked);
        assert!(!hox2.is_methylated);

        let hox3 = genome.genes.get("HOX-3_DATA_STORAGE").unwrap();
        assert_eq!(hox3.chromatin_state, ChromatinState::HeterochromatinFacultative);
        assert!(hox3.developmentally_locked);
        assert!(hox3.is_methylated);
    }

    #[test]
    fn test_differentiate_cell_updates_agent_cell_metadata() {
        let mut cell = AgentCell::new("CellX", "Desc", "HOX-2_LOGIC_BACKEND");
        let mut genome = Genome::new("BASE_HOX_INSTRUCTIONS");
        genome.insert_gene(Gene::new("HOX-2_LOGIC_BACKEND", "PROMPT"));
        assert!(cell.chromatin_state.is_none());
        assert!(cell.genome_id.is_none());

        differentiate_cell(&mut cell, &mut genome);
        assert_eq!(cell.chromatin_state, Some("Differentiated".to_string()));
        assert_eq!(cell.genome_id, Some(genome.genome_id()));
    }

    #[test]
    fn test_apoptosis_selects_fittest_cells_and_prunes_senescent() {
        let mut weak_cell = AgentCell::new("WeakCell", "Desc", "WORKER");
        weak_cell.is_senescent = true;
        weak_cell.bud_scars = 40;
        weak_cell.conscience.current_budget = 5.0;

        let mut strong_cell = AgentCell::new("StrongCell", "Desc", "WORKER");
        strong_cell.is_senescent = false;
        strong_cell.bud_scars = 0;
        strong_cell.conscience.current_budget = 100.0;

        // Même si weak_cell est en première position, c'est strong_cell qui doit survivre
        let mut swarm = vec![weak_cell, strong_cell];
        sculpt_architecture_via_apoptosis(&mut swarm);

        assert_eq!(swarm.len(), 1, "Une seule cellule doit survivre pour ce rôle");
        assert_eq!(swarm[0].name, "StrongCell", "L'élagage doit préserver la cellule la plus viable");
    }
}