//! Moteur de recombinaison locus-par-locus : les 10 strategies biologiques.

use genos_core::RecombinationStrategy;

pub(crate) fn calculate_recombined_locus(
    locus: &genos_core::Locus,
    bob_locus: &genos_core::Locus,
    after_crossover: bool,
    strategy: &RecombinationStrategy,
    prng_state: &mut u64,
) -> genos_core::Locus {
    let mut rand_f32 = || {
        *prng_state = prng_state.wrapping_mul(6364136223846793005).wrapping_add(1);
        (*prng_state >> 32) as f32 / (u32::MAX as f32)
    };

    match strategy {
        RecombinationStrategy::HomologousRecombination => {
            if after_crossover {
                bob_locus.clone()
            } else {
                locus.clone()
            }
        }
        RecombinationStrategy::MultiPointCrossover { .. } => {
            // L'entrelacement des segments est décidé par l'appelant
            // (is_bob_segment) : ici on suit simplement le segment courant.
            if after_crossover {
                bob_locus.clone()
            } else {
                locus.clone()
            }
        }
        RecombinationStrategy::HotspotRecombination { hotspot_genes } => {
            if hotspot_genes.contains(&locus.gene_name) {
                // Hotspot : brassage local quasi-aléatoire (taux accru).
                if rand_f32() < 0.5 {
                    bob_locus.clone()
                } else {
                    locus.clone()
                }
            } else if after_crossover {
                bob_locus.clone()
            } else {
                locus.clone()
            }
        }
        RecombinationStrategy::GeneConversion { dominant_parent } => {
            if dominant_parent == "alice" {
                locus.clone()
            } else {
                bob_locus.clone()
            }
        }
        RecombinationStrategy::NonHomologousEndJoining { error_rate } => {
            let mut base_locus = if after_crossover {
                bob_locus.clone()
            } else {
                locus.clone()
            };
            if rand_f32() < *error_rate {
                let error = (rand_f32() - 0.5) * 0.2;
                base_locus.value = (base_locus.value + error).clamp(0.0, 1.0);
            }
            base_locus
        }
        RecombinationStrategy::SiteSpecific { target_genes } => {
            if target_genes.contains(&locus.gene_name) {
                bob_locus.clone()
            } else {
                locus.clone()
            }
        }
        RecombinationStrategy::DominantRecessive => {
            if locus.expressed_value() > bob_locus.expressed_value() {
                locus.clone()
            } else {
                bob_locus.clone()
            }
        }
        RecombinationStrategy::Gaussian => {
            let mean = (locus.value + bob_locus.value) / 2.0;
            let diff = (locus.value - bob_locus.value).abs().max(0.01);
            // Approximation simple d'une gaussienne via sommation d'uniformes (Irwin-Hall)
            let noise = (rand_f32() + rand_f32() + rand_f32() - 1.5) * diff;
            let mut child = if after_crossover {
                bob_locus.clone()
            } else {
                locus.clone()
            };
            child.value = (mean + noise).clamp(0.0, 1.0);
            child
        }
        RecombinationStrategy::Epistatic => {
            // Épistasie basique simulée via le marqueur épigénétique qui "masque" l'autre gène
            if locus.epigenetic_marker > 0.5 && bob_locus.epigenetic_marker <= 0.5 {
                locus.clone()
            } else if bob_locus.epigenetic_marker > 0.5 && locus.epigenetic_marker <= 0.5 {
                bob_locus.clone()
            } else {
                if after_crossover {
                    bob_locus.clone()
                } else {
                    locus.clone()
                }
            }
        }
        RecombinationStrategy::UniformCrossover { mix_probability } => {
            if rand_f32() < *mix_probability {
                bob_locus.clone()
            } else {
                locus.clone()
            }
        }
    }
}
