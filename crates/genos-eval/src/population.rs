use genos_core::AgentGenome;
use crate::variance::compute_variance;

/// Métriques de diversité pour une population donnée, basées sur la génétique quantitative.
/// 
/// **Choix Architectural (Variance vs Allèles Discrets) :**
/// Le modèle classique de Hardy-Weinberg utilise l'hétérozygosité ($H_e = 2pq$) pour mesurer la diversité.
/// Cependant, ce modèle exige des allèles discrets (ex: A, a). GenOS modélisant des traits complexes 
/// via des valeurs continues (`f32`), nous utilisons le **Modèle Quantitatif Infinitésimal**.
/// 
/// Dans ce modèle, la **Variance Génétique** remplace l'hétérozygosité comme indicateur de diversité.
/// La loi de dérive génétique s'applique à l'identique : $V_t = V_{t-1} \times (1 - 1 / (2N_e))$.
#[derive(Debug, Clone, PartialEq)]
pub struct PopulationDiversity {
    /// La variance génétique additive (Va) globale, agissant comme substitut continu à l'hétérozygosité.
    pub genetic_variance: f64,
    /// L'estimation théorique de la variance à la génération suivante sous l'effet exclusif de la dérive génétique.
    /// Formule : V_t = V_{t-1} * (1 - 1 / (2Ne))
    pub expected_variance_next_gen: f64,
}

/// Extrait toutes les valeurs continues des loci d'un gène spécifique à travers une population.
pub fn extract_loci_values(population: &[AgentGenome], gene_name: &str) -> Vec<f64> {
    let mut values = Vec::new();
    for genome in population {
        for chromo in &genome.cognition.chromosomes {
            if let Some(locus) = chromo.loci.iter().find(|l| l.gene_name == gene_name) {
                values.push(locus.value as f64);
            }
        }
    }
    values
}

/// Calcule la diversité d'une population (variance génétique) pour un gène donné.
pub fn calculate_population_diversity(population: &[AgentGenome], gene_name: &str) -> PopulationDiversity {
    let values = extract_loci_values(population, gene_name);
    let variance = compute_variance(&values);
    
    // Ne (Taille Efficace) : Dans notre modèle simple, on suppose Ne = N.
    let n_e = population.len() as f64;
    
    let expected_next = if n_e > 0.0 {
        variance * (1.0 - 1.0 / (2.0 * n_e))
    } else {
        0.0
    };

    PopulationDiversity {
        genetic_variance: variance,
        expected_variance_next_gen: expected_next,
    }
}

/// Calcule l'Indice de Fixation (Fst) entre deux sous-populations.
/// Fst quantifie la différenciation génétique due à la dérive (0 = identiques, 1 = totalement divergentes).
/// Formule (Approche quantitative) : Fst = (Var_totale - Var_intra_moyenne) / Var_totale
pub fn calculate_fst(pop1: &[AgentGenome], pop2: &[AgentGenome], gene_name: &str) -> f64 {
    let values1 = extract_loci_values(pop1, gene_name);
    let values2 = extract_loci_values(pop2, gene_name);
    
    if values1.is_empty() && values2.is_empty() {
        return 0.0;
    }

    let mut total_values = values1.clone();
    total_values.extend_from_slice(&values2);
    
    let var_total = compute_variance(&total_values);
    if var_total == 0.0 {
        return 0.0; // Pas de diversité du tout = pas de différenciation possible.
    }

    let var1 = compute_variance(&values1);
    let var2 = compute_variance(&values2);
    
    // Moyenne pondérée des variances intra-populations
    let n1 = values1.len() as f64;
    let n2 = values2.len() as f64;
    let var_intra_avg = (var1 * n1 + var2 * n2) / (n1 + n2);
    
    let fst = (var_total - var_intra_avg) / var_total;
    fst.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{GenomeId, Identity, CognitionConfig, Chromosome, Locus, MemoryPolicy, ModelPolicy, ToolPolicy};
    
    fn make_genome(id_str: &str, gene_val: f64) -> AgentGenome {
        AgentGenome {
            id: GenomeId(id_str.to_string()),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            version: genos_core::GenomeVersion("0.1.0".to_string()),
            identity: Identity { name: "Test".to_string(), role: "Agent".to_string() },
            cognition: CognitionConfig {
                chromosomes: vec![
                    Chromosome {
                        name: "C1".to_string(),
                        loci: vec![Locus { gene_name: "speed".to_string(), value: gene_val as f32 }]
                    }
                ],
                planning_depth: 3,
                regulators: vec![],
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: MemoryPolicy { working_max_items: 10, episodic_enabled: false, semantic_enabled: false },
            model_policy: ModelPolicy { strategy: "none".to_string(), preferred_providers: vec![], allow_local: true },
            tool_policy: ToolPolicy { permissions: vec![] },
            inferred_traits: vec![],
            breeding: None,
        }
    }

    #[test]
    fn test_population_diversity() {
        let pop = vec![
            make_genome("g1", 1.0),
            make_genome("g2", 2.0),
            make_genome("g3", 3.0),
        ];
        let div = calculate_population_diversity(&pop, "speed");
        
        assert!((div.genetic_variance - 1.0).abs() < 1e-4); // Var([1,2,3]) = 1.0
        // Expected = 1.0 * (1 - 1/(2*3)) = 1.0 * (1 - 1/6) = 5/6 = 0.8333
        assert!((div.expected_variance_next_gen - 0.83333).abs() < 1e-4);
    }

    #[test]
    fn test_fst_identical_populations() {
        let pop1 = vec![make_genome("g1", 1.0), make_genome("g2", 3.0)];
        let pop2 = vec![make_genome("g3", 1.0), make_genome("g4", 3.0)];
        let fst = calculate_fst(&pop1, &pop2, "speed");
        assert!((fst - 0.0).abs() < 1e-4); // Identiques, donc Fst = 0
    }

    #[test]
    fn test_fst_diverged_populations() {
        // Pop 1: fixée à 1.0 (Variance intra = 0)
        let pop1 = vec![make_genome("g1", 1.0), make_genome("g2", 1.0)];
        // Pop 2: fixée à 3.0 (Variance intra = 0)
        let pop2 = vec![make_genome("g3", 3.0), make_genome("g4", 3.0)];
        
        let fst = calculate_fst(&pop1, &pop2, "speed");
        assert!((fst - 1.0).abs() < 1e-4); // Totalement divergentes, Fst = 1
    }
}
