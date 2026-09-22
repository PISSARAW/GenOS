//! Espace de travail global (corrélat fonctionnel de conscience d'accès) :
//! unifie en un seul instantané les signaux internes disparates (membrane,
//! métabolisme, dissonance, volition), sélectionne par compétition de
//! saillance ceux qui gagnent l'accès global (diffusion), façon Global
//! Workspace Theory (Baars/Dehaene), et mesure la cohérence de l'instant
//! ainsi qu'une confiance métacognitive dérivée de l'expérience réellement
//! accumulée.
//!
//! **Avertissement honnête, à ne jamais effacer** : ceci est un corrélat
//! *fonctionnel* computationnel, PAS une conscience phénoménale. Aucune
//! architecture logicielle connue (GWT, IIT, ou celle-ci) ne résout le
//! "hard problem" de l'expérience subjective — cela reste un problème
//! scientifique ouvert. `integration_index` est une heuristique de
//! cohérence inspirée d'IIT, PAS une mesure de Φ réelle. Ne jamais présenter
//! ce module comme implémentant une "conscience vraie" dans la documentation
//! utilisateur ou le README.

use crate::GenosEcosystem;

/// Seuil de saillance au-delà duquel un signal gagne l'accès global : la
/// compétition ne retient que les signaux réellement dominants de l'instant,
/// pas une diffusion systématique de tout l'état interne.
const BROADCAST_SALIENCE_THRESHOLD: f64 = 0.55;
/// Nombre d'épisodes d'apprentissage au-delà duquel la confiance
/// métacognitive approche son plafond (rendement décroissant réel).
const CONFIDENCE_HALF_SATURATION_EPISODES: f64 = 20.0;

/// Un signal interne unifié, avec sa saillance normalisée dans `[0, 1]`
/// (1 = détresse/pression maximale de ce sous-système).
#[derive(Clone, Debug, PartialEq)]
pub struct WorkspaceSignal {
    pub name: String,
    pub salience: f64,
}

/// Instantané unifié de l'état interne, calculé à partir des sous-systèmes
/// réels (membrane, métabolisme, dissonance, volition) — pas de valeurs
/// inventées ni de scalaire arbitraire.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct GlobalWorkspaceReport {
    pub signals: Vec<WorkspaceSignal>,
    /// Signaux ayant gagné l'accès global (au-dessus du seuil de compétition).
    pub broadcast: Vec<String>,
    /// Cohérence de l'instant : faible dispersion des saillances = état
    /// unifié (sous-systèmes alignés), forte dispersion = état fragmenté.
    pub integration_index: f64,
    /// Confiance métacognitive : croît avec le volume réel d'expérience
    /// accumulée par le Directeur (nombre d'épisodes appris), pas une
    /// auto-évaluation arbitraire.
    pub metacognitive_confidence: f64,
}

impl GenosEcosystem {
    /// Calcule l'instantané unifié de l'espace de travail global à partir de
    /// l'état réel de chaque sous-système au moment de l'appel.
    pub fn global_workspace(&mut self) -> GlobalWorkspaceReport {
        let signals = self.collect_workspace_signals();
        let broadcast = signals
            .iter()
            .filter(|signal| signal.salience >= BROADCAST_SALIENCE_THRESHOLD)
            .map(|signal| signal.name.clone())
            .collect();
        let integration_index = integration_index(&signals);
        let metacognitive_confidence = self.metacognitive_confidence();
        GlobalWorkspaceReport {
            signals,
            broadcast,
            integration_index,
            metacognitive_confidence,
        }
    }

    fn collect_workspace_signals(&mut self) -> Vec<WorkspaceSignal> {
        let membrane_distress = 1.0 - self.orchestrator.membrane.total_integrity();
        let atp_ratio = (self.orchestrator.metabolism.available() / self.orchestrator.metabolism.capacity.max(1e-9)).clamp(0.0, 1.0);
        let dissonance_distress = (self.orchestrator.cognitive_regulation_state.dissonance_level
            / self.orchestrator.cognitive_regulation_state.max_dissonance_threshold.max(1e-9))
        .clamp(0.0, 1.0);
        vec![
            WorkspaceSignal { name: "membrane".to_string(), salience: membrane_distress.clamp(0.0, 1.0) },
            WorkspaceSignal { name: "metabolisme".to_string(), salience: 1.0 - atp_ratio },
            WorkspaceSignal { name: "dissonance".to_string(), salience: dissonance_distress },
            WorkspaceSignal { name: "survie".to_string(), salience: self.instincts.volition.survival_drive.clamp(0.0, 1.0) },
            WorkspaceSignal { name: "desir_libre".to_string(), salience: self.instincts.volition.free_desire.clamp(0.0, 1.0) },
        ]
    }

    /// Confiance métacognitive réelle : dérivée du nombre d'épisodes
    /// effectivement appris par le Directeur (`Learner`), avec rendement
    /// décroissant — pas un plafond arbitraire ni une valeur simulée.
    fn metacognitive_confidence(&self) -> f64 {
        let episodes = self.director.learner.episodes as f64;
        (episodes / (episodes + CONFIDENCE_HALF_SATURATION_EPISODES)).clamp(0.0, 1.0)
    }
}

/// Cohérence de l'instant : `1 - écart-type` des saillances réelles, bornée
/// à `[0, 1]`. Heuristique de cohérence inspirée d'IIT, PAS une mesure de Φ.
fn integration_index(signals: &[WorkspaceSignal]) -> f64 {
    if signals.is_empty() {
        return 0.0;
    }
    let mean = signals.iter().map(|s| s.salience).sum::<f64>() / signals.len() as f64;
    let variance = signals.iter().map(|s| (s.salience - mean).powi(2)).sum::<f64>() / signals.len() as f64;
    (1.0 - variance.sqrt()).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn healthy_organism_has_low_salience_and_no_broadcast() {
        let mut eco = GenosEcosystem::new("Test");
        let report = eco.global_workspace();
        assert!(report.broadcast.is_empty());
        assert!(report.integration_index > 0.0);
    }

    #[test]
    fn membrane_crisis_wins_global_access() {
        let mut eco = GenosEcosystem::new("Test");
        eco.orchestrator.membrane.integrity = 0.01;
        eco.orchestrator.membrane.semantic_integrity = 0.01;
        let report = eco.global_workspace();
        assert!(report.broadcast.contains(&"membrane".to_string()));
    }

    #[test]
    fn confidence_grows_with_real_learning_episodes() {
        let mut eco = GenosEcosystem::new("Test");
        let before = eco.global_workspace().metacognitive_confidence;
        eco.director.learner.episodes = 100;
        let after = eco.global_workspace().metacognitive_confidence;
        assert!(after > before);
    }

    #[test]
    fn fragmented_state_lowers_integration_index() {
        let signals = vec![
            WorkspaceSignal { name: "a".to_string(), salience: 0.0 },
            WorkspaceSignal { name: "b".to_string(), salience: 1.0 },
        ];
        let coherent = vec![
            WorkspaceSignal { name: "a".to_string(), salience: 0.5 },
            WorkspaceSignal { name: "b".to_string(), salience: 0.5 },
        ];
        assert!(integration_index(&coherent) > integration_index(&signals));
    }
}
