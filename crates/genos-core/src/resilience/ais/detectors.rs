//! Anticorps et censure thymique (sélection négative, discrimination Self/Non-Self).

use serde::{Deserialize, Serialize};

/// Anticorps = détecteur sémantique : centroïde d'embedding + rayon de reconnaissance.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Antibody {
    pub id: String,
    pub centroid: Vec<f32>,
    /// Rayon effectif de reconnaissance (0 < radius <= 1 en distance normalisée).
    pub radius: f32,
    pub generation: u32,
}

/// Affinité RBF gaussienne : `exp(-gamma * ||a-b||^2)`, dans [0, 1].
pub fn rbf_affinity(a: &[f32], b: &[f32], gamma: f32) -> f32 {
    let sq_dist: f32 = a.iter().zip(b.iter()).map(|(x, y)| (x - y) * (x - y)).sum();
    (-gamma * sq_dist).exp()
}

/// Censeur thymique : élimine tout détecteur-candidat réagissant au corpus self.
#[derive(Clone, Debug, Default)]
pub struct NegativeSelector {
    self_samples: Vec<Vec<f32>>,
    pub gamma: f32,
    /// Seuil d'affinité au-delà duquel un candidat est considéré auto-réactif.
    pub theta_self: f32,
}

impl NegativeSelector {
    pub fn new(gamma: f32, theta_self: f32) -> Self {
        Self {
            self_samples: Vec::new(),
            gamma,
            theta_self,
        }
    }

    /// Présente un échantillon bénin au « thymus » (moelle osseuse analogique).
    pub fn train_self(&mut self, sample: Vec<f32>) {
        self.self_samples.push(sample);
    }

    /// Nombre d'échantillons self présentés.
    pub fn self_corpus_size(&self) -> usize {
        self.self_samples.len()
    }

    /// Censure : retourne `true` si le candidat est auto-réactif (max affinité self
    /// >= theta_self) et doit être éliminé avant déploiement.
    pub fn censor(&self, candidate: &Antibody) -> bool {
        let max_self_affinity = self
            .self_samples
            .iter()
            .map(|s| rbf_affinity(&candidate.centroid, s, self.gamma))
            .fold(0.0_f32, f32::max);
        max_self_affinity >= self.theta_self
    }

    /// Déploiement tolérant au self : ne conserve que les candidats non auto-réactifs.
    pub fn deploy_tolerant_population(
        &self,
        candidates: Vec<Antibody>,
    ) -> (Vec<Antibody>, Vec<Antibody>) {
        let mut accepted = Vec::new();
        let mut rejected = Vec::new();
        for candidate in candidates {
            if self.censor(&candidate) {
                rejected.push(candidate);
            } else {
                accepted.push(candidate);
            }
        }
        (accepted, rejected)
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
    fn rbf_affinity_is_one_at_zero_distance_and_decays_with_distance() {
        let a = [0.5, 0.5];
        assert!((rbf_affinity(&a, &a, 4.0) - 1.0).abs() < 1e-6);
        let far = [0.9, 0.9];
        let near = [0.55, 0.55];
        assert!(rbf_affinity(&a, &far, 4.0) < rbf_affinity(&a, &near, 4.0));
        assert!(rbf_affinity(&a, &far, 4.0) >= 0.0 && rbf_affinity(&a, &far, 4.0) <= 1.0);
    }

    #[test]
    fn negative_selection_censors_self_reactive_detectors() {
        let mut thymus = NegativeSelector::new(8.0, 0.7);
        // Corpus self : requêtes bénines centrées autour de 0.3.
        thymus.train_self(vec![0.3, 0.3]);
        thymus.train_self(vec![0.32, 0.28]);
        assert_eq!(thymus.self_corpus_size(), 2);

        // Candidat au cœur du self => auto-réactif => éliminé.
        assert!(thymus.censor(&antibody(&[0.31, 0.29])));
        // Candidat loin du self => toléré.
        assert!(!thymus.censor(&antibody(&[0.95, 0.95])));

        let candidates = vec![antibody(&[0.31, 0.29]), antibody(&[0.95, 0.95])];
        let (accepted, rejected) = thymus.deploy_tolerant_population(candidates);
        assert_eq!(accepted.len(), 1);
        assert_eq!(rejected.len(), 1);
    }
}
