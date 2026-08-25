//! Sélection clonale et hypermutation somatique (maturation d'affinité).

use super::detectors::{rbf_affinity, Antibody};

/// Sélecteur clonal : détection, expansion clonale et hypermutation somatique.
#[derive(Clone, Debug)]
pub struct ClonalSelector {
    pub gamma: f32,
    /// Seuil d'affinité au-delà duquel un antigène est reconnu comme menaçant.
    pub theta_threat: f32,
    /// Nombre de clones produits par anticorps activé.
    pub clone_factor: u32,
    /// Écart-type de la mutation somatique des clones.
    pub mutation_sigma: f32,
}

impl ClonalSelector {
    /// Un anticorps lie-t-il cet antigène ?
    pub fn binds(&self, antibody: &Antibody, antigen: &[f32]) -> bool {
        // Le rayon propre de l'anticorps module le seuil de reconnaissance.
        let effective_threshold = self.theta_threat * (1.0 - antibody.radius.clamp(0.0, 1.0));
        rbf_affinity(&antibody.centroid, antigen, self.gamma) >= effective_threshold
    }

    /// Expansion clonale avec hypermutation proportionnelle à l'erreur
    /// (1 - affinité) : moins l'anticorps s'ajuste, plus il mute.
    pub fn expand_and_hypermutate(
        &self,
        parent: &Antibody,
        antigen: &[f32],
        seed: u64,
    ) -> Vec<Antibody> {
        let mut rng_state = seed | 1;
        let affinity = rbf_affinity(&parent.centroid, antigen, self.gamma);
        let error = 1.0 - affinity;
        let mut clones = Vec::with_capacity(self.clone_factor as usize);
        for _ in 0..self.clone_factor {
            let mut centroid = parent.centroid.clone();
            for dim in centroid.iter_mut() {
                let unit =
                    ((crate::hgt::splitmix64(&mut rng_state) >> 40) as f32) / ((1u64 << 24) as f32);
                let unit2 =
                    ((crate::hgt::splitmix64(&mut rng_state) >> 40) as f32) / ((1u64 << 24) as f32);
                let g = (-2.0 * unit.max(f32::EPSILON).ln()).sqrt()
                    * (std::f32::consts::TAU * unit2).cos();
                // Mutation proportionnelle à l'erreur, bornée dans [0, 1] par dimension.
                *dim = (*dim + g * self.mutation_sigma * error).clamp(0.0, 1.0);
            }
            clones.push(Antibody {
                id: format!("{}-c{}", parent.id, rng_state % 10_000),
                centroid,
                radius: parent.radius,
                generation: parent.generation + 1,
            });
        }
        clones
    }

    /// Cycle complet de maturation d'affinité : expansion clonale puis sélection
    /// du clone de meilleure affinité. Retourne `None` si aucun clone ne surpasse
    /// le parent (pas de régression autorisée).
    pub fn mature_affinity(&self, parent: &Antibody, antigen: &[f32], seed: u64) -> Option<Antibody> {
        let parent_affinity = rbf_affinity(&parent.centroid, antigen, self.gamma);
        let clones = self.expand_and_hypermutate(parent, antigen, seed);
        clones
            .into_iter()
            .fold(None, |best, clone| {
                let clone_affinity = rbf_affinity(&clone.centroid, antigen, self.gamma);
                match best {
                    Some((b, ba)) if ba >= clone_affinity => Some((b, ba)),
                    _ => Some((clone, clone_affinity)),
                }
            })
            .and_then(|(best_clone, best_affinity)| {
                (best_affinity > parent_affinity).then_some(best_clone)
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn antibody(centroid: &[f32]) -> Antibody {
        Antibody {
            id: format!("ab-{}", centroid[0]),
            centroid: centroid.to_vec(),
            radius: 0.2,
            generation: 0,
        }
    }

    #[test]
    fn clonal_selector_detects_threats_beyond_radius() {
        let selector = ClonalSelector {
            gamma: 8.0,
            theta_threat: 0.6,
            clone_factor: 4,
            mutation_sigma: 0.05,
        };
        let detector = antibody(&[0.5, 0.5]);
        // Antigène proche : lié.
        assert!(selector.binds(&detector, &[0.52, 0.52]));
        // Antigène distant : non lié.
        assert!(!selector.binds(&detector, &[0.99, 0.99]));
    }

    #[test]
    fn affinity_maturation_improves_or_preserves() {
        let selector = ClonalSelector {
            gamma: 8.0,
            theta_threat: 0.6,
            clone_factor: 16,
            mutation_sigma: 0.08,
        };
        let parent = antibody(&[0.4, 0.4]);
        let antigen = [0.6, 0.6]; // hors rayon optimal du parent
        match selector.mature_affinity(&parent, &antigen, 42) {
            Some(matured) => {
                let pa = rbf_affinity(&parent.centroid, &antigen, selector.gamma);
                let ma = rbf_affinity(&matured.centroid, &antigen, selector.gamma);
                assert!(ma > pa, "le clone retenu doit surpasser le parent");
                assert_eq!(matured.generation, parent.generation + 1);
            }
            None => {
                // Aucun clone ne surpasse le parent : pas de régression autorisée.
                let clones = selector.expand_and_hypermutate(&parent, &antigen, 42);
                for c in clones {
                    assert!(c.generation == parent.generation + 1);
                }
            }
        }
    }

    #[test]
    fn hypermutation_is_error_proportional() {
        let selector = ClonalSelector {
            gamma: 8.0,
            theta_threat: 0.6,
            clone_factor: 8,
            mutation_sigma: 0.1,
        };
        let parent = antibody(&[0.5, 0.5]);
        // Antigène très proche (faible erreur) : les clones restent quasi identiques.
        let near_clones = selector.expand_and_hypermutate(&parent, &[0.51, 0.51], 9);
        let near_spread: f32 = near_clones
            .iter()
            .map(|c| rbf_affinity(&c.centroid, &parent.centroid, selector.gamma))
            .fold(f32::INFINITY, f32::min);

        // Antigène lointain (forte erreur) : les clones s'écartent davantage.
        let far_clones = selector.expand_and_hypermutate(&parent, &[0.05, 0.05], 9);
        let far_spread: f32 = far_clones
            .iter()
            .map(|c| rbf_affinity(&c.centroid, &parent.centroid, selector.gamma))
            .fold(f32::INFINITY, f32::min);

        assert!(
            near_spread > far_spread,
            "mutation plus forte quand l'erreur est grande"
        );
    }
}
