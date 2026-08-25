use crate::genome::AgentGenome;
use serde::{Deserialize, Serialize};

/// Variance gaussienne de base appliquée à chaque drive lors d'une mutation SOS
/// (avant multiplication par `mutation_rate_multiplier`).
pub const BASE_SOS_MUTATION_VARIANCE: f32 = 0.05;

/// Modélise la réponse globale à un stress environnemental extrême.
/// Lorsque le seuil de stress est franchi, cela active une polymérase propice aux erreurs
/// pour accélérer l'exploration de mutations salvatrices.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SosResponse {
    pub stress_threshold: f32,
    pub error_prone_polymerase_active: bool,
    pub mutation_rate_multiplier: f32,
}

impl SosResponse {
    /// Variance effective de la polymérase error-prone : la variance de base est
    /// multipliée par le multiplicateur SOS (branchement réel sur le moteur de mutation).
    pub fn effective_mutation_variance(&self) -> f32 {
        BASE_SOS_MUTATION_VARIANCE * self.mutation_rate_multiplier.max(1.0)
    }
}

/// Échantillon uniforme [0, 1) déterministe dérivé d'un état SplitMix64.
fn next_unit(state: &mut u64) -> f32 {
    ((crate::hgt::splitmix64(state) >> 40) as f32) / ((1u64 << 24) as f32)
}

/// Tirage gaussien N(0, sigma) via Box-Muller, déterministe.
fn next_gaussian(state: &mut u64) -> f32 {
    let u1 = next_unit(state).max(f32::EPSILON);
    let u2 = next_unit(state);
    (-2.0 * u1.ln()).sqrt() * (std::f32::consts::TAU * u2).cos()
}

/// Trait définissant la capacité d'un agent à muter de façon adaptative sous contrainte.
pub trait AdaptiveMutation {
    /// Applique les effets physiologiques et génétiques du stress SOS sur le génome de l'agent.
    fn apply_sos_stress(&mut self, sos_response: &SosResponse);

    /// Mutation réelle sous stress : perturbation gaussienne de tous les drives,
    /// dont la variance est amplifiée par la polymérase error-prone.
    /// Déterministe pour un même `seed` ; retourne un génome enfant traçable.
    fn mutate_under_sos(&self, sos_response: &SosResponse, seed: u64) -> AgentGenome;
}

impl AdaptiveMutation for AgentGenome {
    fn apply_sos_stress(&mut self, sos_response: &SosResponse) {
        if sos_response.error_prone_polymerase_active {
            let claim_name = format!("SOS_ACTIVE_MUT_x{}", sos_response.mutation_rate_multiplier);
            self.infer_trait_claim(&[], &claim_name);
        }
    }

    fn mutate_under_sos(&self, sos_response: &SosResponse, seed: u64) -> AgentGenome {
        if !sos_response.error_prone_polymerase_active {
            // Polymérase inactive : aucune amplification, retour à l'identique du parent.
            return self.clone();
        }

        let variance = sos_response.effective_mutation_variance();
        let mut rng = seed;
        let mut drive_changes = std::collections::BTreeMap::new();
        for (drive_name, value) in self.cognition.clone_drives() {
            let delta = next_gaussian(&mut rng) * variance.sqrt();
            let new_value = (value + delta).clamp(0.0, 1.0);
            drive_changes.insert(drive_name, new_value);
        }
        crate::genome::mutate_cognition(self, drive_changes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::{Chromosome, CognitionConfig, Identity, Locus};
    use crate::ids::GenomeId;

    fn genome(exploration: f32, risk: f32) -> AgentGenome {
        AgentGenome {
            id: GenomeId::new(),
            parent_genome: None,
            parent_genomes: vec![],
            mutation: None,
            breeding: None,
            ecological_niche: None,
            version: crate::genome::GenomeVersion("0.1.0".to_string()),
            identity: Identity {
                name: "t".to_string(),
                role: "test".to_string(),
            },
            cognition: CognitionConfig {
                chromosomes: vec![Chromosome {
                    name: "C1".to_string(),
                    loci: vec![
                        Locus {
                            gene_name: "exploration".to_string(),
                            value: exploration,
                            epigenetic_marker: 0.0,
                        },
                        Locus {
                            gene_name: "risk_tolerance".to_string(),
                            value: risk,
                            epigenetic_marker: 0.0,
                        },
                    ],
                    operons: vec![],
                }],
                planning_depth: 2,
                regulators: vec![],
            },
            objectives: vec![],
            policies: vec![],
            capabilities: vec![],
            memory_policy: crate::genome::MemoryPolicy {
                working_max_items: 1,
                episodic_enabled: false,
                semantic_enabled: false,
            },
            model_policy: crate::genome::ModelPolicy {
                strategy: "test".to_string(),
                preferred_providers: vec![],
                allow_local: true,
            },
            tool_policy: crate::genome::ToolPolicy { permissions: vec![] },
            inferred_traits: vec![],
        }
    }

    fn active_sos(multiplier: f32) -> SosResponse {
        SosResponse {
            stress_threshold: 0.8,
            error_prone_polymerase_active: true,
            mutation_rate_multiplier: multiplier,
        }
    }

    #[test]
    fn inactive_polymerase_leaves_genome_unchanged() {
        let g = genome(0.5, 0.5);
        let sos = SosResponse {
            stress_threshold: 0.8,
            error_prone_polymerase_active: false,
            mutation_rate_multiplier: 4.0,
        };
        let child = g.mutate_under_sos(&sos, 42);
        assert_eq!(child.cognition.get_drive("exploration"), Some(0.5));
        assert_eq!(child.cognition.get_drive("risk_tolerance"), Some(0.5));
    }

    #[test]
    fn sos_mutation_is_traceable_and_deterministic() {
        let g = genome(0.5, 0.5);
        let a = g.mutate_under_sos(&active_sos(3.0), 7);
        let b = g.mutate_under_sos(&active_sos(3.0), 7);
        // Même seed => mêmes mutations.
        assert_eq!(a.cognition.get_drive("exploration"), b.cognition.get_drive("exploration"));
        // Parenté tracée + journal de mutation présent.
        assert_eq!(a.parent_genome, Some(g.id.clone()));
        assert_eq!(a.mutation.as_ref().unwrap().changes.len(), 2);
    }

    #[test]
    fn higher_multiplier_amplifies_deviation_on_average() {
        let g = genome(0.5, 0.5);
        let deviation_for = |multiplier: f32| -> f32 {
            let mut total = 0.0;
            for seed in 0..200u64 {
                let child = g.mutate_under_sos(&active_sos(multiplier), seed);
                let e = child.cognition.get_drive("exploration").unwrap();
                total += (e - 0.5).abs();
            }
            total / 200.0
        };
        // sqrt(10) ≈ 3.16x plus de variance attendue avec multiplicateur x10 vs x1.
        assert!(deviation_for(10.0) > deviation_for(1.0) * 2.0);
    }

    #[test]
    fn mutated_drives_stay_within_allele_bounds() {
        let g = genome(0.99, 0.01);
        for seed in 0..100u64 {
            let child = g.mutate_under_sos(&active_sos(20.0), seed);
            for (_, v) in child.cognition.clone_drives() {
                assert!((0.0..=1.0).contains(&v));
            }
        }
    }

    #[test]
    fn effective_variance_scales_with_multiplier_and_is_bounded_below() {
        assert_eq!(active_sos(1.0).effective_mutation_variance(), BASE_SOS_MUTATION_VARIANCE);
        assert_eq!(active_sos(4.0).effective_mutation_variance(), BASE_SOS_MUTATION_VARIANCE * 4.0);
        // Multiplicateur < 1 borné au plancher x1.
        assert_eq!(active_sos(0.2).effective_mutation_variance(), BASE_SOS_MUTATION_VARIANCE);
    }
}
