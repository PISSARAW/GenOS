use genos_core::{AgentGenome, PhenotypeObservation};
use crate::qtl::map_qtl;

/// Contient la décomposition complète de la variance d'un trait au sein d'une population.
/// 
/// L'équation fondamentale modélisée est : `Vp = Va + Vd + Vi + Ve`
#[derive(Debug, Clone, PartialEq)]
pub struct VarianceDecomposition {
    /// Variance Phénotypique Totale
    pub v_p: f64,
    /// Variance Additive (Liée aux effets linéaires des gènes isolés)
    pub v_a: f64,
    /// Variance de Dominance (Liée aux interactions d'allèles sur le même locus)
    pub v_d: f64,
    /// Variance d'Épistasie (Liée aux interactions entre gènes différents)
    pub v_i: f64,
    /// Variance Environnementale
    pub v_e: f64,
}

impl VarianceDecomposition {
    /// **Héritabilité au sens large (H²)**
    /// 
    /// Mesure la part de la variance phénotypique totale due à *tous* les effets génétiques.
    /// Formule : `H² = (Va + Vd + Vi) / Vp`
    pub fn broad_sense_heritability(&self) -> f64 {
        if self.v_p == 0.0 {
            return 0.0;
        }
        let v_g = self.v_a + self.v_d + self.v_i;
        (v_g / self.v_p).clamp(0.0, 1.0)
    }

    /// **Héritabilité au sens étroit (h²)**
    /// 
    /// Mesure la part de la variance phénotypique imputable *uniquement* à la variance additive (Va).
    /// C'est la métrique la plus utile en sélection artificielle pour prédire la réponse à la sélection 
    /// (Équation de l'Éleveur : `R = h² * S`).
    /// Formule : `h² = Va / Vp`
    pub fn narrow_sense_heritability(&self) -> f64 {
        if self.v_p == 0.0 {
            return 0.0;
        }
        (self.v_a / self.v_p).clamp(0.0, 1.0)
    }
}

/// Calcule la variance d'une série de nombres
pub fn compute_variance(values: &[f64]) -> f64 {
    let n = values.len() as f64;
    if n < 2.0 {
        return 0.0;
    }
    let mean = values.iter().sum::<f64>() / n;
    let sum_sq_diff: f64 = values.iter().map(|&v| (v - mean) * (v - mean)).sum();
    // Variance de l'échantillon (n - 1) ou population (n) ? On utilise (n-1) pour un estimateur sans biais.
    sum_sq_diff / (n - 1.0)
}

/// Décompose la variance génétique (Vp = Va + Vd + Vi + Ve) d'une population.
/// 
/// **Choix Architectural (Génétique Quantitative Moderne) :**
/// Plutôt que de s'appuyer sur un pedigree théorique (covariance parent-enfant) ou 
/// sur un arbre phylogénétique (inadapté pour la variance intra-population / micro-évolution), 
/// cette fonction utilise une **approche génomique directe (GBLUP-like / GWAS)**.
/// Puisque le système a un accès direct au code ADN exact des agents (les loci), 
/// il effectue une régression linéaire liant la valeur des gènes au phénotype.
/// 
/// Cela permet d'estimer la **Variance Additive (Va)** avec une précision moléculaire, 
/// capturant ainsi la réalité de la transmission génétique bien mieux qu'une simple 
/// attente théorique basée sur un pedigree.
pub fn decompose_trait_variance(
    population: &[AgentGenome],
    phenotypes: &[PhenotypeObservation],
    target_trait: &str,
) -> VarianceDecomposition {
    // 1. Isoler les scores du trait ciblé
    let mut scores = Vec::new();
    for p in phenotypes {
        if let Some(trait_obs) = p.traits.iter().find(|t| t.name == target_trait) {
            scores.push(trait_obs.value as f64);
        }
    }

    if scores.len() < 2 || population.len() != phenotypes.len() {
        return VarianceDecomposition {
            v_p: 0.0,
            v_a: 0.0,
            v_d: 0.0,
            v_i: 0.0,
            v_e: 0.0,
        };
    }

    // 2. Variance Phénotypique totale (Vp)
    let v_p = compute_variance(&scores);
    if v_p == 0.0 {
        return VarianceDecomposition {
            v_p: 0.0,
            v_a: 0.0,
            v_d: 0.0,
            v_i: 0.0,
            v_e: 0.0,
        };
    }

    // 3. Modèle Génomique (Régression QTL)
    // Pour approximer GBLUP avec notre système actuel, on calcule la part de variance expliquée par chaque gène.
    // La somme de ces variances linéaires isolées (Pearson) nous donne la Variance Additive (Va) proportionnelle à Vp.
    let qtl_results = map_qtl(population, phenotypes, 0.0);
    
    let mut total_additive_r2 = 0.0;
    let mut total_nonlinear_r2 = 0.0;
    
    for qtl in qtl_results {
        if qtl.trait_name == target_trait {
            // La covariance au carré (Pearson R²) indique la variance expliquée par un modèle strictement additif/linéaire.
            total_additive_r2 += qtl.variance_explained;
            
            // Spearman R² mesure la corrélation monotone. 
            // La différence entre (Spearman R²) et (Pearson R²) peut capturer une partie des effets non-linéaires (Dominance/Épistasie).
            // Ceci est une approximation génomique simple.
            let spearman_r2 = qtl.spearman_correlation * qtl.spearman_correlation;
            if spearman_r2 > qtl.variance_explained {
                total_nonlinear_r2 += spearman_r2 - qtl.variance_explained;
            }
        }
    }

    // H² (large) = Somme des R² cumulés ne peut pas dépasser 1.0 théoriquement (modulo colinéarité, qu'on néglige ici pour la simplicité MVP)
    total_additive_r2 = total_additive_r2.clamp(0.0, 1.0);
    let remaining_for_nonlinear = 1.0 - total_additive_r2;
    total_nonlinear_r2 = total_nonlinear_r2.clamp(0.0, remaining_for_nonlinear);

    let v_a = v_p * total_additive_r2;
    
    // Arbitrairement pour ce MVP, on assigne l'effet non-linéaire à l'Épistasie (interaction), car la Dominance intra-locus (Vd) 
    // nécessiterait un code diploïde, or notre système est haploïde/continu.
    let v_i = v_p * total_nonlinear_r2;
    let v_d = 0.0;

    let v_e = v_p - (v_a + v_d + v_i);

    VarianceDecomposition {
        v_p,
        v_a,
        v_d,
        v_i,
        v_e: v_e.max(0.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{GenomeId, Identity, CognitionConfig, Chromosome, Locus, ObservedTrait, MemoryPolicy, ModelPolicy, ToolPolicy};
    
    fn make_genome(id_str: &str, exploration_val: f64, risk_val: f64) -> AgentGenome {
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
                        loci: vec![
                            Locus { gene_name: "exploration".to_string(), value: exploration_val as f32, epigenetic_marker: 0.0 },
                            Locus { gene_name: "risk".to_string(), value: risk_val as f32, epigenetic_marker: 0.0 },
                        ]
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
    
    fn make_phenotype(id_str: &str, score: f64) -> PhenotypeObservation {
        PhenotypeObservation {
            genome_id: GenomeId(id_str.to_string()),
            evaluation_suite: "test_suite".to_string(),
            model: "test_model".to_string(),
            environment: "test_env".to_string(),
            measured_at: chrono::Utc::now(),
            traits: vec![ObservedTrait { 
                name: "success".to_string(), 
                value: score,
                confidence: 1.0,
                observations: 1,
                method: "Exact".to_string(),
                evidence: vec![]
            }],
        }
    }

    #[test]
    fn test_compute_variance() {
        let vals = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let var = compute_variance(&vals);
        assert!((var - 2.5).abs() < 1e-5); // Variance d'échantillon de [1,2,3,4,5] est 2.5
    }

    #[test]
    fn test_variance_decomposition_perfect_correlation() {
        let pop = vec![
            make_genome("g1", 1.0, 0.0),
            make_genome("g2", 2.0, 0.0),
            make_genome("g3", 3.0, 0.0),
            make_genome("g4", 4.0, 0.0),
            make_genome("g5", 5.0, 0.0),
        ];
        let phenotypes = vec![
            make_phenotype("g1", 10.0),
            make_phenotype("g2", 20.0),
            make_phenotype("g3", 30.0),
            make_phenotype("g4", 40.0),
            make_phenotype("g5", 50.0),
        ];
        
        let decomp = decompose_trait_variance(&pop, &phenotypes, "success");
        
        assert!((decomp.v_p - 250.0).abs() < 1e-4);
        // Parfaitement corrélé avec "exploration", donc Va = Vp, Ve = 0
        assert!((decomp.v_a - 250.0).abs() < 1e-4);
        assert!((decomp.v_e).abs() < 1e-4);
        assert!((decomp.narrow_sense_heritability() - 1.0).abs() < 1e-4);
    }
}
