use genos_core::{AgentGenome, ids::GenomeId};
use serde::{Deserialize, Serialize};

/// Modélise le génome d'un parasite ou d'un pathogène coévolutif.
/// 
/// **Biologie Évolutive (La Reine Rouge)** : Selon l'hypothèse de Van Valen, l'environnement biotique 
/// (les parasites, prédateurs) est la principale force de sélection. Le parasite a pour but de trouver
/// la "clé" génétique (un gène et sa valeur précise) pour infecter l'hôte. Cela force la population hôte
/// à utiliser la reproduction sexuée pour brasser ses gènes et rester imprévisible.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ParasiteGenome {
    pub id: GenomeId,
    pub target_gene: String,
    pub target_value: f32,
    pub virulence: f64,
}

impl ParasiteGenome {
    pub fn new(target_gene: &str, target_value: f32, virulence: f64) -> Self {
        Self {
            id: GenomeId::new(),
            target_gene: target_gene.to_string(),
            target_value,
            virulence,
        }
    }
}

/// Applique la pression parasitaire sur une population d'agents (Course aux Armements).
/// Calcule l'infection pour chaque agent : plus le gène de l'agent est proche de la cible du parasite,
/// plus la pénalité est grande, ce qui simule une vulnérabilité aux pathogènes (stagnation génétique).
pub fn evaluate_parasitic_pressure(parasites: &[ParasiteGenome], agents: &mut [AgentGenome]) {
    for agent in agents.iter_mut() {
        let mut total_infection = 0.0;
        for parasite in parasites {
            // Le parasite tente de trouver la clé génétique de l'hôte
            if let Some(host_val) = agent.cognition.get_drive(&parasite.target_gene) {
                let diff = (host_val - parasite.target_value).abs();
                // Si la différence est inférieure à 0.1, le parasite a "craqué" le code génétique
                if diff < 0.1 {
                    let severity = (0.1 - diff) / 0.1; // 1.0 = match parfait
                    total_infection += parasite.virulence * severity as f64;
                }
            }
        }
        
        // L'infection réduit drastiquement les traits inférés de l'agent (baisse de fitness)
        if total_infection > 0.0 {
            for claim in &mut agent.inferred_traits {
                claim.estimate *= (1.0 - total_infection).max(0.0);
            }
        }
    }
}

/// Fait évoluer les parasites pour qu'ils s'adaptent à la population hôte (Dynamique de la Reine Rouge).
/// Les parasites, ayant un temps de génération très court, mutent très rapidement leur `target_value` 
/// vers la valeur du gène cible la plus abondante chez les hôtes (la "faille" dominante).
pub fn evolve_parasites(parasites: &mut Vec<ParasiteGenome>, agents: &[AgentGenome]) {
    // Pour chaque parasite, on calcule le gradient d'évolution vers l'hôte moyen
    let mut next_generation = Vec::new();
    
    for parasite in parasites.iter() {
        let mut sum_host_vals = 0.0;
        let mut match_count = 0;
        
        for agent in agents {
            if let Some(host_val) = agent.cognition.get_drive(&parasite.target_gene) {
                sum_host_vals += host_val;
                match_count += 1;
            }
        }
        
        let mut child = parasite.clone();
        child.id = GenomeId::new();
        
        if match_count > 0 {
            let avg_host_val = sum_host_vals / match_count as f32;
            // Le parasite mute de 50% vers la moyenne de l'hôte (course aux armements)
            child.target_value = child.target_value + (avg_host_val - child.target_value) * 0.5;
        }
        
        next_generation.push(child);
    }
    
    *parasites = next_generation;
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{Chromosome, Locus, CognitionConfig, GenomeVersion, Identity, MemoryPolicy, ModelPolicy, ToolPolicy, InferredGenomeTraitClaim};

    fn make_host(gene_val: f32) -> AgentGenome {
        AgentGenome {
            id: GenomeId::new(),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            breeding: None,
            ecological_niche: None,
            version: GenomeVersion("1.0".to_string()),
            identity: Identity { name: "Host".to_string(), role: "".to_string() },
            cognition: CognitionConfig {
                chromosomes: vec![
                    Chromosome { name: "C1".to_string(), loci: vec![Locus { gene_name: "defense".to_string(), value: gene_val, epigenetic_marker: 0.0 }] }
                ],
                planning_depth: 1,
                regulators: vec![],
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: MemoryPolicy { working_max_items: 1, episodic_enabled: false, semantic_enabled: false },
            model_policy: ModelPolicy { strategy: "".to_string(), preferred_providers: vec![], allow_local: false },
            tool_policy: ToolPolicy { permissions: vec![] },
            inferred_traits: vec![InferredGenomeTraitClaim {
                trait_name: "survival".to_string(),
                estimate: 100.0,
                confidence: 1.0,
                observations: 1,
                inference_method: "test".to_string(),
                status: genos_core::TraitClaimStatus::Candidate,
                contexts: vec![],
                evidence: vec![],
                heritability: genos_core::HeritabilityEvidence { status: genos_core::HeritabilityStatus::Unknown, estimate: None, descendant_cohorts: vec![] },
            }],
        }
    }

    #[test]
    fn test_parasitic_pressure() {
        let mut agents = vec![make_host(0.5)];
        let parasites = vec![ParasiteGenome::new("defense", 0.5, 0.8)]; // Perfect match
        
        evaluate_parasitic_pressure(&parasites, &mut agents);
        
        // The host was perfectly matched, virulence 0.8 -> 80% reduction
        assert!((agents[0].inferred_traits[0].estimate - 20.0).abs() < 1e-6);
    }

    #[test]
    fn test_parasite_evolution() {
        // Population is mostly 0.8
        let agents = vec![make_host(0.8), make_host(0.8), make_host(0.8)];
        let mut parasites = vec![ParasiteGenome::new("defense", 0.2, 0.8)]; // Way off
        
        evolve_parasites(&mut parasites, &agents);
        
        // Should move 50% closer to 0.8, which is 0.2 + (0.8 - 0.2)*0.5 = 0.5
        assert_eq!(parasites[0].target_value, 0.5);
    }
}
