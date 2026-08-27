use genos_core::AgentGenome;
use rand::seq::SliceRandom;
use rand::Rng;
use rand::SeedableRng;

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

/// Modélise l'Effet Fondateur.
///
/// **Logique Évolutive :**
/// Une nouvelle population (colonie) est fondée par un très petit échantillon
/// aléatoire — indépendant de la fitness — de la population source. La colonie
/// ne transporte qu'une fraction *biaisée* de la diversité génétique parentale :
/// sa variance est typiquement inférieure à celle de la source, et les allèles
/// (ici : valeurs de gènes) rares ont une forte probabilité d'être perdus.
///
/// Contrairement au bottleneck (qui ampute la population existante), le fondateur
/// CRÉE une nouvelle lignée à partir de `founder_count` individus tirés dans
/// `source`. L'échantillonnage est déterministe pour un même `seed`.
pub fn founder_effect(source: &[AgentGenome], founder_count: usize, seed: u64) -> Vec<AgentGenome> {
    if source.is_empty() || founder_count == 0 {
        return Vec::new();
    }
    let mut seed_bytes = [0u8; 32];
    seed_bytes[..8].copy_from_slice(&seed.to_le_bytes());
    let mut rng = rand::rngs::StdRng::from_seed(seed_bytes);
    let mut indices: Vec<usize> = (0..source.len()).collect();
    indices.shuffle(&mut rng);
    indices
        .into_iter()
        .take(founder_count.min(source.len()))
        .filter_map(|i| source.get(i).cloned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use genos_core::{CognitionConfig, GenomeId, Identity, MemoryPolicy, ModelPolicy, ToolPolicy};

    fn make_genome(id_str: &str) -> AgentGenome {
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
                chromosomes: vec![],
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
    fn test_founder_effect_reduces_diversity_and_is_deterministic() {
        use genos_core::{Chromosome, Locus};
        let mut make = |id: &str, exploration: f32| {
            let mut g = make_genome(id);
            g.cognition.chromosomes.push(Chromosome {
                name: "C1".into(),
                loci: vec![Locus {
                    gene_name: "exploration".into(),
                    value: exploration,
                    epigenetic_marker: 0.0,
                }],
                operons: vec![],
            });
            g
        };
        // Population source très diversifiée : 10 valeurs étalées sur [0, 1].
        let source: Vec<AgentGenome> = (0..10)
            .map(|i| make(&format!("s{i}"), i as f32 / 9.0))
            .collect();

        // La colonie est fondée par 3 individus seulement.
        let colony = founder_effect(&source, 3, 42);
        assert_eq!(colony.len(), 3);
        assert!(colony.iter().all(|g| g.id.0.starts_with("s")));

        // Déterminisme : même seed => même colonie.
        let again = founder_effect(&source, 3, 42);
        assert_eq!(
            colony.iter().map(|g| &g.id).collect::<Vec<_>>(),
            again.iter().map(|g| &g.id).collect::<Vec<_>>()
        );

        // La variance de la colonie ne peut jamais excéder celle de la source.
        let variance_of = |pop: &[AgentGenome]| -> f64 {
            let vals: Vec<f64> = pop
                .iter()
                .map(|g| g.cognition.get_drive("exploration").unwrap() as f64)
                .collect();
            let mean = vals.iter().sum::<f64>() / vals.len() as f64;
            vals.iter().map(|v| (v - mean) * (v - mean)).sum::<f64>() / vals.len() as f64
        };
        assert!(variance_of(&colony) <= variance_of(&source) + 1e-12);

        // Cas dégénérés.
        assert!(founder_effect(&source, 0, 1).is_empty());
        assert!(founder_effect(&[], 5, 1).is_empty());
        // Demander plus de fondateurs que la source borne à la taille source.
        assert_eq!(founder_effect(&source, 50, 7).len(), 10);
    }

    #[test]
    fn test_migration_step() {
        let deme1 = vec![
            make_genome("d1_1"),
            make_genome("d1_2"),
            make_genome("d1_3"),
            make_genome("d1_4"),
        ];
        let deme2 = vec![
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
