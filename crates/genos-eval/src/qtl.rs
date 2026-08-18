use genos_core::{AgentGenome, PhenotypeObservation};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
pub struct QtlDataPoint {
    pub gene_value: f64,
    pub trait_value: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct QtlAnalysis {
    pub gene_name: String,
    pub trait_name: String,
    pub pearson_correlation: f64,
    pub spearman_correlation: f64,
    pub variance_explained: f64,
}

pub fn compute_pearson_correlation(data: &[QtlDataPoint]) -> f64 {
    let n = data.len() as f64;
    if n < 2.0 {
        return 0.0;
    }

    let sum_x: f64 = data.iter().map(|d| d.gene_value).sum();
    let sum_y: f64 = data.iter().map(|d| d.trait_value).sum();
    let sum_x_sq: f64 = data.iter().map(|d| d.gene_value * d.gene_value).sum();
    let sum_y_sq: f64 = data.iter().map(|d| d.trait_value * d.trait_value).sum();
    let sum_xy: f64 = data.iter().map(|d| d.gene_value * d.trait_value).sum();

    let numerator = n * sum_xy - sum_x * sum_y;
    let denominator_sq = (n * sum_x_sq - sum_x * sum_x) * (n * sum_y_sq - sum_y * sum_y);

    if denominator_sq <= 0.0 {
        return 0.0;
    }

    numerator / denominator_sq.sqrt()
}

pub fn compute_spearman_correlation(data: &[QtlDataPoint]) -> f64 {
    let n = data.len();
    if n < 2 {
        return 0.0;
    }

    // Helper to rank data
    fn rank(values: &[f64]) -> Vec<f64> {
        let mut indexed: Vec<(usize, f64)> = values.iter().copied().enumerate().collect();
        indexed.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        
        let mut ranks = vec![0.0; values.len()];
        let mut i = 0;
        while i < indexed.len() {
            let mut j = i + 1;
            while j < indexed.len() && (indexed[j].1 - indexed[i].1).abs() < 1e-9 {
                j += 1;
            }
            let rank_sum: f64 = (i..j).map(|r| (r + 1) as f64).sum();
            let avg_rank = rank_sum / ((j - i) as f64);
            for k in i..j {
                ranks[indexed[k].0] = avg_rank;
            }
            i = j;
        }
        ranks
    }

    let gene_values: Vec<f64> = data.iter().map(|d| d.gene_value).collect();
    let trait_values: Vec<f64> = data.iter().map(|d| d.trait_value).collect();

    let gene_ranks = rank(&gene_values);
    let trait_ranks = rank(&trait_values);

    let mut rank_data = Vec::with_capacity(n);
    for i in 0..n {
        rank_data.push(QtlDataPoint {
            gene_value: gene_ranks[i],
            trait_value: trait_ranks[i],
        });
    }

    compute_pearson_correlation(&rank_data)
}

pub fn map_qtl(genomes: &[AgentGenome], phenotypes: &[PhenotypeObservation], min_variance_explained: f64) -> Vec<QtlAnalysis> {
    // Create a map from genome_id -> PhenotypeObservation
    let mut phenotype_map = HashMap::new();
    for p in phenotypes {
        phenotype_map.insert(&p.genome_id, p);
    }

    // Group data points by (gene_name, trait_name)
    // gene_name -> (trait_name -> Vec<QtlDataPoint>)
    let mut grouped_data: HashMap<String, HashMap<String, Vec<QtlDataPoint>>> = HashMap::new();

    for genome in genomes {
        if let Some(pheno) = phenotype_map.get(&genome.id) {
            // Extract all gene values
            for chrom in &genome.cognition.chromosomes {
                for locus in &chrom.loci {
                    let gene_val = locus.value as f64;
                    let gene_name = &locus.gene_name;

                    // Extract all trait values
                    for obs_trait in &pheno.traits {
                        let trait_val = obs_trait.value;
                        let trait_name = &obs_trait.name;

                        grouped_data
                            .entry(gene_name.clone())
                            .or_default()
                            .entry(trait_name.clone())
                            .or_default()
                            .push(QtlDataPoint { gene_value: gene_val, trait_value: trait_val });
                    }
                }
            }
        }
    }

    let mut results = Vec::new();

    for (gene_name, trait_map) in grouped_data {
        for (trait_name, data) in trait_map {
            if data.len() < 2 {
                continue;
            }
            let pearson = compute_pearson_correlation(&data);
            let spearman = compute_spearman_correlation(&data);
            
            // We can use pearson for variance_explained (R^2), or the max of both depending on preference.
            // Pearson r^2 is standard.
            let variance_explained = pearson * pearson;
            
            if variance_explained >= min_variance_explained {
                results.push(QtlAnalysis {
                    gene_name: gene_name.clone(),
                    trait_name,
                    pearson_correlation: pearson,
                    spearman_correlation: spearman,
                    variance_explained,
                });
            }
        }
    }

    // Sort descending by variance_explained
    results.sort_by(|a, b| b.variance_explained.partial_cmp(&a.variance_explained).unwrap_or(std::cmp::Ordering::Equal));
    
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{GenomeId, AgentGenome, CognitionConfig, Chromosome, Locus, ObservedTrait};
    use chrono::Utc;

    #[test]
    fn test_compute_pearson() {
        let data = vec![
            QtlDataPoint { gene_value: 1.0, trait_value: 2.0 },
            QtlDataPoint { gene_value: 2.0, trait_value: 4.0 },
            QtlDataPoint { gene_value: 3.0, trait_value: 6.0 },
        ];
        let p = compute_pearson_correlation(&data);
        assert!((p - 1.0).abs() < 1e-6);

        let data_inv = vec![
            QtlDataPoint { gene_value: 1.0, trait_value: 6.0 },
            QtlDataPoint { gene_value: 2.0, trait_value: 4.0 },
            QtlDataPoint { gene_value: 3.0, trait_value: 2.0 },
        ];
        let p_inv = compute_pearson_correlation(&data_inv);
        assert!((p_inv - (-1.0)).abs() < 1e-6);
    }

    #[test]
    fn test_compute_spearman() {
        let data = vec![
            QtlDataPoint { gene_value: 1.0, trait_value: 10.0 },
            QtlDataPoint { gene_value: 2.0, trait_value: 100.0 }, // non-linear but monotonic
            QtlDataPoint { gene_value: 3.0, trait_value: 1000.0 },
        ];
        let s = compute_spearman_correlation(&data);
        assert!((s - 1.0).abs() < 1e-6);
    }

    fn dummy_genome() -> AgentGenome {
        serde_json::from_str(r#"{
            "id": "test_id",
            "version": "1.0",
            "identity": { "name": "test", "role": "test" },
            "cognition": { "planning_depth": 1, "chromosomes": [] },
            "objectives": [],
            "policies": [],
            "capabilities": [],
            "memory_policy": { "working_max_items": 1, "episodic_enabled": false, "semantic_enabled": false },
            "model_policy": { "strategy": "default", "preferred_providers": [], "allow_local": true },
            "tool_policy": { "permissions": [] }
        }"#).unwrap()
    }

    #[test]
    fn test_map_qtl() {
        let mut genomes = Vec::new();
        let mut phenotypes = Vec::new();

        for i in 0..10 {
            let mut g = dummy_genome();
            g.id = GenomeId(format!("g{}", i));
            g.cognition.chromosomes = vec![Chromosome {
                name: "chrom1".to_string(),
                loci: vec![Locus {
                    gene_name: "curiosity".to_string(),
                    value: i as f32 * 0.1,
                }]
            }];
            genomes.push(g);

            phenotypes.push(PhenotypeObservation {
                genome_id: GenomeId(format!("g{}", i)),
                evaluation_suite: "test".to_string(),
                model: "m".to_string(),
                environment: "e".to_string(),
                measured_at: Utc::now(),
                traits: vec![ObservedTrait {
                    name: "exploration".to_string(),
                    value: i as f64 * 10.0, // perfect correlation
                    confidence: 1.0,
                    observations: 1,
                    method: "test".to_string(),
                    evidence: vec![],
                }]
            });
        }

        let results = map_qtl(&genomes, &phenotypes, 0.5);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].gene_name, "curiosity");
        assert_eq!(results[0].trait_name, "exploration");
        assert!((results[0].pearson_correlation - 1.0).abs() < 1e-6);
        assert!((results[0].variance_explained - 1.0).abs() < 1e-6);
    }
}
