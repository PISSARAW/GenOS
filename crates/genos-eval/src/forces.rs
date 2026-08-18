use genos_core::AgentGenome;
use rand::Rng;
use rand::seq::SliceRandom;

/// ModÃ©lise la DÃ©rive GÃ©nÃ©tique (Effet de Goulet d'Ã‰tranglement).
/// 
/// **Logique Ã‰volutive :**
/// En gÃ©nÃ©tique des populations, la dÃ©rive est la fluctuation alÃ©atoire des frÃ©quences allÃ©liques. 
/// Pour notre modÃ¨le quantitatif, nous appliquons un "Bottleneck" : un Ã©chantillonnage strictement 
/// alÃ©atoire de `survivor_count` individus qui survivent indÃ©pendamment de leur fitness.
/// 
/// MathÃ©matiquement, cela rÃ©duit mÃ©caniquement la variance gÃ©nÃ©tique globale selon la loi $V_t = V_{t-1} \times (1 - 1 / (2N_e))$.
pub fn genetic_drift_bottleneck(population: &mut Vec<AgentGenome>, survivor_count: usize) {
    if population.len() <= survivor_count {
        return;
    }
    
    let mut rng = rand::thread_rng();
    population.shuffle(&mut rng);
    population.truncate(survivor_count);
}

/// ModÃ©lise la Migration (Flux de gÃ¨nes) entre plusieurs sous-populations isolÃ©es (DÃ¨mes).
/// 
/// **Logique Ã‰volutive :**
/// La migration contrecarre la dÃ©rive gÃ©nÃ©tique. Alors que la dÃ©rive diffÃ©rencie les dÃ¨mes 
/// (augmentant le $F_{ST}$), la migration les homogÃ©nÃ©ise (faisant chuter le $F_{ST}$ vers 0).
/// 
/// La fonction brasse alÃ©atoirement un pourcentage `migration_rate` (ex: 0.05 pour 5%) de 
/// la population de chaque dÃ¨me vers un autre dÃ¨me choisi au hasard.
pub fn migration_step(demes: &mut [Vec<AgentGenome>], migration_rate: f64) {
    if demes.len() < 2 || migration_rate <= 0.0 {
        return;
    }
    
    let migration_rate = migration_rate.clamp(0.0, 1.0);
    let mut rng = rand::thread_rng();
    
    let mut migrants = Vec::new();
    
    // 1. Collecter les migrants de chaque dÃ¨me
    for (i, deme) in demes.iter_mut().enumerate() {
        let num_migrants = (deme.len() as f64 * migration_rate).round() as usize;
        deme.shuffle(&mut rng);
        let mut departing = deme.split_off(deme.len().saturating_sub(num_migrants));
        for agent in departing.drain(..) {
            migrants.push((i, agent));
        }
    }
    
    // 2. Redistribuer alÃ©atoirement les migrants, en Ã©vitant qu'ils ne retournent dans leur dÃ¨me d'origine si possible
    migrants.shuffle(&mut rng);
    let num_demes = demes.len();
    
    for (origin_idx, agent) in migrants {
        let mut target_idx = rng.gen_range(0..num_demes);
        if target_idx == origin_idx {
            target_idx = (target_idx + 1) % num_demes; // Forcer le changement de dÃ¨me
        }
        demes[target_idx].push(agent);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{GenomeId, Identity, CognitionConfig, MemoryPolicy, ModelPolicy, ToolPolicy};
    
    fn make_genome(id_str: &str) -> AgentGenome {
        AgentGenome {
            id: GenomeId(id_str.to_string()),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            ecological_niche: None,
            version: genos_core::GenomeVersion("0.1.0".to_string()),
            identity: Identity { name: "Test".to_string(), role: "Agent".to_string() },
            cognition: CognitionConfig {
                chromosomes: vec![],
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
    fn test_genetic_drift_bottleneck() {
        let mut pop = vec![
            make_genome("g1"),
            make_genome("g2"),
            make_genome("g3"),
            make_genome("g4"),
            make_genome("g5"),
        ];
        
        genetic_drift_bottleneck(&mut pop, 2);
        
        assert_eq!(pop.len(), 2);
    }

    #[test]
    fn test_migration_step() {
        let mut deme1 = vec![
            make_genome("d1_1"),
            make_genome("d1_2"),
            make_genome("d1_3"),
            make_genome("d1_4"),
        ];
        let mut deme2 = vec![
            make_genome("d2_1"),
            make_genome("d2_2"),
            make_genome("d2_3"),
            make_genome("d2_4"),
        ];
        
        let mut demes = vec![deme1, deme2];
        
        // Taux de migration de 50% = 2 agents par dÃ¨me vont migrer.
        migration_step(&mut demes, 0.5);
        
        // Chaque dÃ¨me devrait rÃ©cupÃ©rer 2 agents de l'autre, gardant une taille globale Ã©quilibrÃ©e (Ã  peu prÃ¨s).
        assert_eq!(demes[0].len(), 4);
        assert_eq!(demes[1].len(), 4);
        
        // VÃ©rifions qu'un mix s'est produit (d1 dans deme2 et d2 dans deme1)
        let d1_has_d2 = demes[0].iter().any(|g| g.id.0.starts_with("d2_"));
        let d2_has_d1 = demes[1].iter().any(|g| g.id.0.starts_with("d1_"));
        assert!(d1_has_d2);
        assert!(d2_has_d1);
    }
}
