use genos_core::AgentGenome;
use std::collections::BTreeMap;
use crate::parasitism::ParasiteGenome;

/// Représente l'environnement inerte et ses ressources limitées.
#[derive(Debug, Clone)]
pub struct Biotope {
    /// Les ressources disponibles avec leur Capacité de Charge (K).
    pub carrying_capacities: BTreeMap<String, f32>,
}

/// Représente l'écosystème complet (biotope + biocénose parasite).
#[derive(Debug, Clone)]
pub struct Ecosystem {
    pub biotope: Biotope,
    pub parasites: Vec<ParasiteGenome>,
}

/// Évalue une population d'agents dans un écosystème complet.
/// Applique d'abord la compétition pour les ressources inertes (Biotope), 
/// puis la pression parasitaire (Course aux armements).
pub fn evaluate_ecosystem(ecosystem: &Ecosystem, agents: &mut [AgentGenome]) {
    evaluate_niche_competition(&ecosystem.biotope, agents);
    crate::parasitism::evaluate_parasitic_pressure(&ecosystem.parasites, agents);
}

/// Applique le Principe d'Exclusion Compétitive de Gause.
/// Si la demande cumulée d'une ressource (Niche Réalisée) dépasse la capacité de charge du biotope (K),
/// une pénalité de densité-dépendance (Lotka-Volterra simplifié) est appliquée à la fitness des agents.
pub fn evaluate_niche_competition(biotope: &Biotope, agents: &mut [AgentGenome]) {
    let mut resource_usage: BTreeMap<String, f32> = BTreeMap::new();

    // 1. Calculer la charge totale sur chaque ressource par la population entiÃ¨re (Niche RÃ©alisÃ©e globale)
    for agent in agents.iter() {
        if let Some(niche) = &agent.ecological_niche {
            for (resource, demand) in &niche.resource_requirements {
                *resource_usage.entry(resource.clone()).or_insert(0.0) += demand;
            }
        }
    }

    // 2. Appliquer la pénalité de densité-dépendance (compétition)
    for agent in agents.iter_mut() {
        if let Some(niche) = &agent.ecological_niche {
            let mut survival_penalty = 1.0;

            for (resource, demand) in &niche.resource_requirements {
                if let Some(&k) = biotope.carrying_capacities.get(resource) {
                    let total_demand = resource_usage.get(resource).unwrap_or(&0.0);
                    // Si la demande totale dÃ©passe la capacitÃ© de charge, il y a compÃ©tition (exclusion compÃ©titive).
                    if *total_demand > k && k > 0.0 {
                        // Ratio de survie sur cette ressource : (K / Demande Totale)
                        // Plus la demande est forte, plus la survie baisse (pÃ©nalitÃ© multiplicative).
                        let resource_survival_rate = k / total_demand;
                        
                        // L'impact de la pÃ©nurie est pondÃ©rÃ© par le besoin de l'agent (demand).
                        // Ceci est une simplification mathÃ©matique du modÃ¨le de Lotka-Volterra.
                        survival_penalty *= resource_survival_rate.powf(*demand);
                    }
                }
            }

            // 3. Modifier les traits infÃ©rÃ©s (baisse de fitness gÃ©nÃ©rale)
            for claim in &mut agent.inferred_traits {
                claim.estimate *= survival_penalty as f64;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{EcologicalNiche, ids::GenomeId, InferredGenomeTraitClaim};

    #[test]
    fn test_competitive_exclusion() {
        let mut biotope = Biotope {
            carrying_capacities: BTreeMap::new(),
        };
        biotope.carrying_capacities.insert("cpu".to_string(), 2.0); // Seulement 2.0 de cpu dispo

        // Agent 1: Petit besoin en CPU
        let mut a1 = AgentGenome {
            id: GenomeId("A1".to_string()),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            version: genos_core::GenomeVersion("0.1.0".to_string()),
            identity: genos_core::Identity { name: "A1".to_string(), role: "".to_string() },
            cognition: genos_core::CognitionConfig { chromosomes: vec![], planning_depth: 1, regulators: vec![] },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: genos_core::MemoryPolicy { working_max_items: 1, episodic_enabled: false, semantic_enabled: false },
            model_policy: genos_core::ModelPolicy { strategy: "".to_string(), preferred_providers: vec![], allow_local: false },
            tool_policy: genos_core::ToolPolicy { permissions: vec![] },
            inferred_traits: vec![],
            breeding: None,
            ecological_niche: None,
        };
        let mut req1 = BTreeMap::new();
        req1.insert("cpu".to_string(), 1.0);
        a1.ecological_niche = Some(EcologicalNiche { resource_requirements: req1 });
        a1.inferred_traits.push(InferredGenomeTraitClaim {
            trait_name: "survival_ability".to_string(),
            estimate: 1.0,
            confidence: 1.0,
            observations: 1,
            inference_method: "test".to_string(),
            status: genos_core::TraitClaimStatus::Candidate,
            contexts: vec![],
            evidence: vec![],
            heritability: genos_core::HeritabilityEvidence { status: genos_core::HeritabilityStatus::Unknown, estimate: None, descendant_cohorts: vec![] },
        });

        // Agent 2: Gros besoin en CPU
        let mut a2 = AgentGenome {
            id: GenomeId("A2".to_string()),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            version: genos_core::GenomeVersion("0.1.0".to_string()),
            identity: genos_core::Identity { name: "A2".to_string(), role: "".to_string() },
            cognition: genos_core::CognitionConfig { chromosomes: vec![], planning_depth: 1, regulators: vec![] },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: genos_core::MemoryPolicy { working_max_items: 1, episodic_enabled: false, semantic_enabled: false },
            model_policy: genos_core::ModelPolicy { strategy: "".to_string(), preferred_providers: vec![], allow_local: false },
            tool_policy: genos_core::ToolPolicy { permissions: vec![] },
            inferred_traits: vec![],
            breeding: None,
            ecological_niche: None,
        };
        let mut req2 = BTreeMap::new();
        req2.insert("cpu".to_string(), 3.0);
        a2.ecological_niche = Some(EcologicalNiche { resource_requirements: req2 });
        a2.inferred_traits.push(InferredGenomeTraitClaim {
            trait_name: "survival_ability".to_string(),
            estimate: 1.0,
            confidence: 1.0,
            observations: 1,
            inference_method: "test".to_string(),
            status: genos_core::TraitClaimStatus::Candidate,
            contexts: vec![],
            evidence: vec![],
            heritability: genos_core::HeritabilityEvidence { status: genos_core::HeritabilityStatus::Unknown, estimate: None, descendant_cohorts: vec![] },
        });

        let mut population = vec![a1, a2];

        // Total demand = 4.0, K = 2.0 -> Ratio = 0.5
        // A1 survival_penalty = 0.5 ^ 1.0 = 0.5
        // A2 survival_penalty = 0.5 ^ 3.0 = 0.125
        evaluate_niche_competition(&biotope, &mut population);

        assert_eq!(population[0].inferred_traits[0].estimate, 0.5);
        assert_eq!(population[1].inferred_traits[0].estimate, 0.125);
    }
}
