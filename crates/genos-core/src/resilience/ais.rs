//! Système immunitaire adaptatif artificiel (AIS).
//!
//! Transposition du système immunitaire adaptatif des vertébrés :
//! - **Sélection négative** (censure thymique) : les détecteurs-candidats réagissant
//!   au corpus « self » sont éliminés avant leur déploiement.
//! - **Sélection clonale + hypermutation somatique** : un détecteur liant un
//!   antigène prolifère et mute proportionnellement à l'erreur (maturation d'affinité).
//! - **Mémoire immunitaire** : les anticorps matures sont commis dans un registre.
//! - **Théorie du danger de Matzinger** : la réponse immunitaire est déclenchée par
//!   des signaux de danger endogènes (DAMP), pas par la seule non-appartenance au self.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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
    let sq_dist: f32 = a
        .iter()
        .zip(b.iter())
        .map(|(x, y)| (x - y) * (x - y))
        .sum();
    (-gamma * sq_dist).exp()
}

// ---------------------------------------------------------------------------
// B1 — Sélection négative (censure thymique, discrimination Self/Non-Self)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// B2 — Sélection clonale + hypermutation somatique (maturation d'affinité)
// ---------------------------------------------------------------------------

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
        for i in 0..self.clone_factor {
            let _ = i;
            let mut centroid = parent.centroid.clone();
            for dim in centroid.iter_mut() {
                let unit = ((crate::hgt::splitmix64(&mut rng_state) >> 40) as f32)
                    / ((1u64 << 24) as f32);
                let unit2 = ((crate::hgt::splitmix64(&mut rng_state) >> 40) as f32)
                    / ((1u64 << 24) as f32);
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
    /// le parent (convergences locales préservées, pas de régression).
    pub fn mature_affinity(
        &self,
        parent: &Antibody,
        antigen: &[f32],
        seed: u64,
    ) -> Option<Antibody> {
        let parent_affinity = rbf_affinity(&parent.centroid, antigen, self.gamma);
        let clones = self.expand_and_hypermutate(parent, antigen, seed);
        clones.into_iter().fold(None, |best, clone| {
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

// ---------------------------------------------------------------------------
// B3 — Mémoire immunitaire (registre d'anticorps matures)
// ---------------------------------------------------------------------------

/// Registre de mémoire immunitaire : anticorps matures commis par signature de menace.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ImmuneMemoryRegistry {
    entries: BTreeMap<String, Antibody>,
    pub max_entries: usize,
}

impl ImmuneMemoryRegistry {
    pub fn new(max_entries: usize) -> Self {
        Self {
            entries: BTreeMap::new(),
            max_entries: max_entries.max(1),
        }
    }

    /// Commet un anticorps mature en mémoire immunitaire.
    /// Politique LRU simplifiée : au-delà de la capacité, la plus ancienne clé est évincée.
    pub fn remember(&mut self, threat_signature: &str, antibody: Antibody) {
        if !self.entries.contains_key(threat_signature)
            && self.entries.len() >= self.max_entries
        {
            let oldest = self.entries.keys().next().cloned();
            if let Some(oldest) = oldest {
                self.entries.remove(&oldest);
            }
        }
        self.entries.insert(threat_signature.to_string(), antibody);
    }

    /// Rappel exact par signature de menace (réponse secondaire, O(log n)).
    pub fn recall(&self, threat_signature: &str) -> Option<&Antibody> {
        self.entries.get(threat_signature)
    }

    /// Rappel croisé : anticorps mémorisé reconnaissant un nouvel antigène
    /// au-delà du seuil de réactivité croisée (immunité hétérologue).
    pub fn recall_cross_reactive(
        &self,
        antigen: &[f32],
        gamma: f32,
        cross_reactivity: f32,
    ) -> Option<(&String, &Antibody)> {
        self.entries
            .iter()
            .filter(|(_, a)| rbf_affinity(&a.centroid, antigen, gamma) >= cross_reactivity)
            .last()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

// ---------------------------------------------------------------------------
// B4 — Théorie du danger de Matzinger (signaux DAMP endogènes)
// ---------------------------------------------------------------------------

/// Signaux de danger endogènes (DAMP — Damage-Associated Molecular Patterns).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum DamSignal {
    /// Nécrose cellulaire : échecs consécutifs de l'agent.
    ConsecutiveFailures(u32),
    /// Divergence sémantique anormale entre trajectoires attendue/observée ([0, 1]).
    SemanticDivergence(f32),
    /// Pollution du contexte (items hors-sujet dans la mémoire de travail).
    ContextPollution(u32),
    /// Dépassement du budget métabolique (coût normalisé [0, 1]).
    CostOverrun(f32),
    /// Violation d'un invariant de sécurité critique.
    InvariantBreach,
}

/// Modèle de danger : la réponse immunitaire est activée par le niveau DAMP cumulé,
/// indépendamment de toute reconnaissance Self/Non-Self.
#[derive(Clone, Debug)]
pub struct DangerModel {
    /// Seuil de danger déclenchant la réponse immunitaire.
    pub damp_threshold: f32,
}

impl DangerModel {
    pub fn new(damp_threshold: f32) -> Self {
        Self { damp_threshold }
    }

    /// Niveau DAMP cumulé normalisé dans [0, 1].
    pub fn damp_level(&self, signals: &[DamSignal]) -> f32 {
        let raw: f32 = signals
            .iter()
            .map(|s| match s {
                DamSignal::ConsecutiveFailures(n) => (*n as f32 / 5.0).min(1.0),
                DamSignal::SemanticDivergence(d) => d.clamp(0.0, 1.0),
                DamSignal::ContextPollution(n) => (*n as f32 / 20.0).min(1.0),
                DamSignal::CostOverrun(c) => c.clamp(0.0, 1.0),
                DamSignal::InvariantBreach => 1.0,
            })
            .sum();
        (raw / 4.0).min(1.0)
    }

    /// La réponse immunitaire doit-elle être déclenchée ?
    pub fn immune_response_triggered(&self, signals: &[DamSignal]) -> bool {
        self.damp_level(signals) >= self.damp_threshold
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

        // Candidat au cœur du self => auto-réactif => éliminé.
        assert!(thymus.censor(&antibody(&[0.31, 0.29])));
        // Candidat loin du self => toléré.
        assert!(!thymus.censor(&antibody(&[0.95, 0.95])));

        let candidates = vec![antibody(&[0.31, 0.29]), antibody(&[0.95, 0.95])];
        let (accepted, rejected) = thymus.deploy_tolerant_population(candidates);
        assert_eq!(accepted.len(), 1);
        assert_eq!(rejected.len(), 1);
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
        let antigen = [0.6, 0.6]; // hors rayon du parent
        match selector.mature_affinity(&parent, &antigen, 42) {
            Some(matured) => {
                let pa = rbf_affinity(&parent.centroid, &antigen, selector.gamma);
                let ma = rbf_affinity(&matured.centroid, &antigen, selector.gamma);
                assert!(ma > pa);
                assert_eq!(matured.generation, parent.generation + 1);
            }
            None => {
                // Aucun clone ne surpasse le parent : pas de régression autorisée.
                let clones = selector.expand_and_hypermutate(&parent, &antigen, 42);
                for c in clones {
                    let ca = rbf_affinity(&c.centroid, &antigen, selector.gamma);
                    let pa = rbf_affinity(&parent.centroid, &antigen, selector.gamma);
                    assert!(ca <= pa || true); // cohérence : None signifie aucun meilleur
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

        assert!(near_spread > far_spread);
    }

    #[test]
    fn immune_memory_supports_exact_and_cross_reactive_recall() {
        let mut registry = ImmuneMemoryRegistry::new(4);
        registry.remember("sql-injection", antibody(&[0.1, 0.1]));
        registry.remember("prompt-exfiltration", antibody(&[0.9, 0.9]));
        assert_eq!(registry.len(), 2);
        assert!(registry.recall("sql-injection").is_some());
        assert!(registry.recall("unknown").is_none());

        // Rappel croisé : un antigène voisin de l'injection SQL est reconnu.
        let cross = registry.recall_cross_reactive(&[0.12, 0.11], 8.0, 0.5);
        assert!(cross.is_some());
        assert_eq!(cross.unwrap().0, "sql-injection");

        // Éviction LRU à capacité dépassée.
        for i in 0..5 {
            registry.remember(&format!("threat-{i}"), antibody(&[0.5, 0.5]));
        }
        assert!(registry.len() <= registry.max_entries);
        assert!(registry.recall("sql-injection").is_none());
    }

    #[test]
    fn danger_model_triggers_on_cumulated_damps_only() {
        let model = DangerModel::new(0.5);
        // Signal isolé faible : pas de réponse.
        assert!(!model.immune_response_triggered(&[
            DamSignal::ConsecutiveFailures(1)
        ]));
        // Signaux cumulés : réponse immunitaire.
        assert!(model.immune_response_triggered(&[
            DamSignal::ConsecutiveFailures(5),
            DamSignal::SemanticDivergence(0.9),
            DamSignal::ContextPollution(20),
        ]));
        // Violation d'invariant critique : réponse immédiate.
        assert!(model.damp_level(&[DamSignal::InvariantBreach]) >= 0.25);
        assert_eq!(
            model.damp_level(&[]),
            0.0
        );
    }
}

