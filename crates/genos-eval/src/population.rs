use crate::variance::compute_variance;
use genos_core::AgentGenome;

/// MÃ©triques de diversitÃ© pour une population donnÃ©e, basÃ©es sur la gÃ©nÃ©tique quantitative.
///
/// **Choix Architectural (Variance vs AllÃ¨les Discrets) :**
/// Le modÃ¨le classique de Hardy-Weinberg utilise l'hÃ©tÃ©rozygositÃ© ($H_e = 2pq$) pour mesurer la diversitÃ©.
/// Cependant, ce modÃ¨le exige des allÃ¨les discrets (ex: A, a). GenOS modÃ©lisant des traits complexes
/// via des valeurs continues (`f32`), nous utilisons le **ModÃ¨le Quantitatif InfinitÃ©simal**.
///
/// Dans ce modÃ¨le, la **Variance GÃ©nÃ©tique** remplace l'hÃ©tÃ©rozygositÃ© comme indicateur de diversitÃ©.
/// La loi de dÃ©rive gÃ©nÃ©tique s'applique Ã  l'identique : $V_t = V_{t-1} \times (1 - 1 / (2N_e))$.
#[derive(Debug, Clone, PartialEq)]
pub struct PopulationDiversity {
    /// La variance gÃ©nÃ©tique additive (Va) globale, agissant comme substitut continu Ã  l'hÃ©tÃ©rozygositÃ©.
    pub genetic_variance: f64,
    /// L'estimation thÃ©orique de la variance Ã  la gÃ©nÃ©ration suivante sous l'effet exclusif de la dÃ©rive gÃ©nÃ©tique.
    /// Formule : V_t = V_{t-1} * (1 - 1 / (2Ne))
    pub expected_variance_next_gen: f64,
}

/// Extrait toutes les valeurs continues des loci d'un gène spécifique à travers une population.
pub fn extract_loci_values(population: &[AgentGenome], gene_name: &str) -> Vec<f64> {
    let mut values = Vec::new();
    for genome in population {
        for chromo in &genome.cognition.chromosomes {
            if let Some(locus) = chromo.loci.iter().find(|l| l.gene_name == gene_name) {
                values.push(locus.expressed_value() as f64);
            }
        }
    }
    values
}

/// Calcule la diversitÃ© d'une population (variance gÃ©nÃ©tique) pour un gÃ¨ne donnÃ©.
pub fn calculate_population_diversity(
    population: &[AgentGenome],
    gene_name: &str,
) -> PopulationDiversity {
    let values = extract_loci_values(population, gene_name);
    let variance = compute_variance(&values);

    // Ne (Taille Efficace) : Dans notre modÃ¨le simple, on suppose Ne = N.
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
/// Fst quantifie la diffÃ©renciation gÃ©nÃ©tique due Ã  la dÃ©rive (0 = identiques, 1 = totalement divergentes).
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
        return 0.0; // Pas de diversitÃ© du tout = pas de diffÃ©renciation possible.
    }

    let var1 = compute_variance(&values1);
    let var2 = compute_variance(&values2);

    // Moyenne pondÃ©rÃ©e des variances intra-populations
    let n1 = values1.len() as f64;
    let n2 = values2.len() as f64;
    let var_intra_avg = (var1 * n1 + var2 * n2) / (n1 + n2);

    let fst = (var_total - var_intra_avg) / var_total;
    fst.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{
        Chromosome, CognitionConfig, GenomeId, Identity, Locus, MemoryPolicy, ModelPolicy,
        ToolPolicy,
    };

    fn make_genome(id_str: &str, gene_val: f64) -> AgentGenome {
        AgentGenome {
            id: GenomeId(id_str.to_string()),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            ecological_niche: None,
            version: genos_core::GenomeVersion("0.1.0".to_string()),
            identity: Identity {
                name: "Test".to_string(),
                role: "Agent".to_string(),
            },
            cognition: CognitionConfig {
                chromosomes: vec![Chromosome {
                    name: "C1".to_string(),
                    operons: vec![],
                    loci: vec![Locus {
                        gene_name: "speed".to_string(),
                        value: gene_val as f32,
                        epigenetic_marker: 0.0,
                    }],
                }],
                planning_depth: 3,
                regulators: vec![],
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: MemoryPolicy {
                working_max_items: 10,
                episodic_enabled: false,
                semantic_enabled: false,
            },
            model_policy: ModelPolicy {
                strategy: "none".to_string(),
                preferred_providers: vec![],
                allow_local: true,
            },
            tool_policy: ToolPolicy {
                permissions: vec![],
            },
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
        // Pop 1: fixÃ©e Ã  1.0 (Variance intra = 0)
        let pop1 = vec![make_genome("g1", 1.0), make_genome("g2", 1.0)];
        // Pop 2: fixÃ©e Ã  3.0 (Variance intra = 0)
        let pop2 = vec![make_genome("g3", 3.0), make_genome("g4", 3.0)];

        let fst = calculate_fst(&pop1, &pop2, "speed");
        assert!((fst - 1.0).abs() < 1e-4); // Totalement divergentes, Fst = 1
    }
}

/// Coefficient de consanguinité de Wright (F).
///
/// **Logique Évolutive :**
/// Dans une population de taille effective finie, la consanguinité s'accumule
/// à chaque génération : `F_t = 1 - (1 - 1/(2*Ne))^t`, avec F_0 = 0.
/// F mesure la probabilité d'identité par descendance de deux gènes homologues ;
/// F → 1 quand la population se reproduit exclusivement entre apparentés.
///
/// En complément, `inbreeding_from_variance` estime F en régime quantitatif :
/// `F = 1 - Var_t / Var_0` — la perte relative de variance génétique observée
/// depuis la génération fondatrice est le substitut continu de l'hétérozygotie
/// perdue.
pub fn wright_inbreeding_coefficient(effective_size: f64, generations: u32) -> f64 {
    if effective_size <= 0.0 {
        return 1.0;
    }
    let per_generation = 1.0 - 1.0 / (2.0 * effective_size);
    1.0 - per_generation.powi(generations as i32)
}

/// Estimation quantitative de F par perte de variance relative.
pub fn inbreeding_from_variance(variance_initial: f64, variance_current: f64) -> f64 {
    if variance_initial <= 0.0 {
        return 1.0;
    }
    (1.0 - variance_current / variance_initial).clamp(0.0, 1.0)
}

#[cfg(test)]
mod inbreeding_tests {
    use super::*;

    #[test]
    fn inbreeding_accumulates_and_saturates() {
        assert_eq!(wright_inbreeding_coefficient(100.0, 0), 0.0);
        let f10 = wright_inbreeding_coefficient(100.0, 10);
        let f50 = wright_inbreeding_coefficient(100.0, 50);
        // Croissance monotone, bornée par 1.
        assert!(f10 > 0.0 && f50 > f10 && f50 < 1.0);
        // Formule exacte sur un cas simple : Ne=1, t=1 => F = 1/2.
        assert!((wright_inbreeding_coefficient(1.0, 1) - 0.5).abs() < 1e-12);
        // Petite population => consanguinité rapide.
        assert!(wright_inbreeding_coefficient(4.0, 5) > f10);
    }

    #[test]
    fn degenerate_sizes_are_handled() {
        assert_eq!(wright_inbreeding_coefficient(0.0, 3), 1.0, "population éteinte");
    }

    #[test]
    fn variance_loss_maps_to_inbreeding() {
        // Perte de moitié de la variance => F = 0.5.
        assert!((inbreeding_from_variance(2.0, 1.0) - 0.5).abs() < 1e-12);
        // Aucune perte => F = 0 ; gain impossible borné à 0.
        assert_eq!(inbreeding_from_variance(1.0, 1.0), 0.0);
        assert_eq!(inbreeding_from_variance(1.0, 4.0), 0.0);
        assert_eq!(inbreeding_from_variance(0.0, 1.0), 1.0);
    }
}
