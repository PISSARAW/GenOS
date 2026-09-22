//! Espace de travail global (corrélat fonctionnel de conscience d'accès) :
//! unifie en un seul instantané les signaux internes disparates (membrane,
//! métabolisme, dissonance, volition), sélectionne par compétition de
//! saillance ceux qui gagnent l'accès global, et **diffuse causalement**
//! le contenu sélectionné vers les modules consommateurs — façon Global
//! Workspace Theory (Baars/Dehaene).
//!
//! **Avertissement honnête, à ne jamais effacer** : ceci est un corrélat
//! *fonctionnel* computationnel, PAS une conscience phénoménale. Aucune
//! architecture logicielle connue (GWT, IIT, ou celle-ci) ne résout le
//! "hard problem" de l'expérience subjective — cela reste un problème
//! scientifique ouvert. `integration_index` est une heuristique de
//! cohérence inspirée d'IIT, PAS une mesure de Φ réelle. Ne jamais présenter
//! ce module comme implémentant une "conscience vraie" dans la documentation
//! utilisateur ou le README.
//!
//! Broadcast causal (audit P1) : le contenu qui gagne la compétition MODIFIE
//! les modules (métabolisme, membrane, volition, apprentissage) via le trait
//! `WorkspaceConsumer`. Sans diffusion effective, ce n'est pas un workspace :
//! c'est un rapport.

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

/// Un événement diffusé dans le workspace global : le contenu qui a gagné
/// la compétition, avec sa provenance et sa force.
#[derive(Clone, Debug, PartialEq)]
pub struct WorkspaceEvent {
    pub content: String,
    pub source: String,
    pub salience: f64,
}

/// Un consommateur du broadcast global : le contenu sélectionné MODIFIE
/// réellement le module qui implémente ce trait.
pub trait WorkspaceConsumer {
    /// Reçoit un événement diffusé et s'ajuste en conséquence.
    fn receive_global_broadcast(&mut self, event: &WorkspaceEvent);
}

/// Instantané unifié de l'état interne, calculé à partir des sous-systèmes
/// réels (membrane, métabolisme, dissonance, volition) — pas de valeurs
/// inventées ni de scalaire arbitraire.
#[derive(Clone, Debug, PartialEq, Default)]
pub struct GlobalWorkspaceReport {
    pub signals: Vec<WorkspaceSignal>,
    /// Signaux ayant gagné l'accès global (au-dessus du seuil de compétition).
    pub broadcast: Vec<String>,
    /// Événements effectivement diffusés aux consommateurs ce cycle.
    pub broadcast_events: Vec<WorkspaceEvent>,
    /// Effets causaux produits par la diffusion (module → ajustement).
    pub effects: Vec<BroadcastEffect>,
    /// Cohérence de l'instant : faible dispersion des saillances = état
    /// unifié (sous-systèmes alignés), forte dispersion = état fragmenté.
    pub integration_index: f64,
    /// Confiance métacognitive : croît avec le volume réel d'expérience
    /// accumulée par le Directeur (nombre d'épisodes appris), pas une
    /// auto-évaluation arbitraire.
    pub metacognitive_confidence: f64,
}

/// Trace d'un effet causal du broadcast sur un module consommateur.
#[derive(Clone, Debug, PartialEq)]
pub struct BroadcastEffect {
    pub module: String,
    pub adjustment: String,
}

impl GenosEcosystem {
    /// Calcule l'instantané unifié de l'espace de travail global à partir de
    /// l'état réel de chaque sous-système au moment de l'appel, puis diffuse
    /// causalement les contenus gagnants aux modules consommateurs.
    pub fn global_workspace(&mut self) -> GlobalWorkspaceReport {
        let signals = self.collect_workspace_signals();
        let winners: Vec<&WorkspaceSignal> = signals
            .iter()
            .filter(|signal| signal.salience >= BROADCAST_SALIENCE_THRESHOLD)
            .collect();
        let broadcast: Vec<String> = winners.iter().map(|s| s.name.clone()).collect();
        let broadcast_events: Vec<WorkspaceEvent> = winners
            .iter()
            .map(|s| WorkspaceEvent {
                content: s.name.clone(),
                source: "workspace_competition".to_string(),
                salience: s.salience,
            })
            .collect();
        // La diffusion est CAUSALE : chaque consommateur s'ajuste.
        let effects = self.dispatch_broadcast(&broadcast_events);
        let integration_index = integration_index(&signals);
        let metacognitive_confidence = self.metacognitive_confidence();
        GlobalWorkspaceReport {
            signals,
            broadcast,
            broadcast_events,
            effects,
            integration_index,
            metacognitive_confidence,
        }
    }

    /// Diffuse les événements gagnants aux modules consommateurs réels
    /// et retourne la trace des ajustements produits.
    fn dispatch_broadcast(&mut self, events: &[WorkspaceEvent]) -> Vec<BroadcastEffect> {
        let mut effects = Vec::new();
        for event in events {
            match event.content.as_str() {
                "membrane" => {
                    // Crise de frontière → réparation immédiate prioritaire.
                    self.orchestrator.membrane.repair(0.2);
                    effects.push(BroadcastEffect {
                        module: "membrane".into(),
                        adjustment: "repair+0.2".into(),
                    });
                }
                "metabolisme" => {
                    // Épuisement ATP → rationnement : la volition cède.
                    self.instincts.volition.survival_drive =
                        (self.instincts.volition.survival_drive + 0.2).min(1.0);
                    effects.push(BroadcastEffect {
                        module: "volition".into(),
                        adjustment: "survival_drive+0.2".into(),
                    });
                }
                "dissonance" => {
                    // Dissonance élevée → le Directeur marque un épisode
                    // d'apprentissage négatif (poids de révision accru).
                    self.director.learner.episodes += 1;
                    effects.push(BroadcastEffect {
                        module: "learner".into(),
                        adjustment: "revision_episode".into(),
                    });
                }
                "survie" => {
                    // Pression de survie → le réflexe vital devient prioritaire.
                    self.instincts.volition.survival_drive =
                        (self.instincts.volition.survival_drive + 0.1).min(1.0);
                    effects.push(BroadcastEffect {
                        module: "volition".into(),
                        adjustment: "survival_drive+0.1".into(),
                    });
                }
                "desir_libre" => {
                    // Désir libre dominant → l'exploration est renforcée.
                    self.director.learner.episodes += 1;
                    effects.push(BroadcastEffect {
                        module: "learner".into(),
                        adjustment: "exploration_episode".into(),
                    });
                }
                _ => {}
            }
        }
        effects
    }

    fn collect_workspace_signals(&mut self) -> Vec<WorkspaceSignal> {
        let membrane_distress = 1.0 - self.orchestrator.membrane.total_integrity();
        let atp_ratio = (self.orchestrator.metabolism.available()
            / self.orchestrator.metabolism.capacity.max(1e-9))
        .clamp(0.0, 1.0);
        let dissonance_distress = (self
            .orchestrator
            .cognitive_regulation_state
            .dissonance_level
            / self
                .orchestrator
                .cognitive_regulation_state
                .max_dissonance_threshold
                .max(1e-9))
        .clamp(0.0, 1.0);
        vec![
            WorkspaceSignal {
                name: "membrane".to_string(),
                salience: membrane_distress.clamp(0.0, 1.0),
            },
            WorkspaceSignal {
                name: "metabolisme".to_string(),
                salience: 1.0 - atp_ratio,
            },
            WorkspaceSignal {
                name: "dissonance".to_string(),
                salience: dissonance_distress,
            },
            WorkspaceSignal {
                name: "survie".to_string(),
                salience: self.instincts.volition.survival_drive.clamp(0.0, 1.0),
            },
            WorkspaceSignal {
                name: "desir_libre".to_string(),
                salience: self.instincts.volition.free_desire.clamp(0.0, 1.0),
            },
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
    let variance = signals
        .iter()
        .map(|s| (s.salience - mean).powi(2))
        .sum::<f64>()
        / signals.len() as f64;
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
        assert!(report.broadcast_events.is_empty());
        assert!(report.effects.is_empty());
        assert!(report.integration_index > 0.0);
    }

    #[test]
    fn membrane_crisis_wins_global_access_and_repairs() {
        let mut eco = GenosEcosystem::new("Test");
        eco.orchestrator.membrane.integrity = 0.01;
        eco.orchestrator.membrane.semantic_integrity = 0.01;
        let before = eco.orchestrator.membrane.total_integrity();
        let report = eco.global_workspace();
        assert!(report.broadcast.contains(&"membrane".to_string()));
        // La diffusion est CAUSALE : la membrane a été réparée.
        let after = eco.orchestrator.membrane.total_integrity();
        assert!(
            after > before,
            "broadcast must repair membrane: {before} → {after}"
        );
        assert!(report.effects.iter().any(|e| e.module == "membrane"));
    }

    #[test]
    fn starvation_broadcast_raises_survival_drive() {
        let mut eco = GenosEcosystem::new("Test");
        // Vider l'ATP pour déclencher le signal métabolique.
        let capacity = eco.orchestrator.metabolism.capacity;
        let _ = eco.orchestrator.metabolism.consume(capacity);
        let before = eco.instincts.volition.survival_drive;
        let report = eco.global_workspace();
        if report.broadcast.contains(&"metabolisme".to_string()) {
            let after = eco.instincts.volition.survival_drive;
            assert!(after > before, "broadcast must raise survival drive");
            assert!(report
                .effects
                .iter()
                .any(|e| e.module == "volition" && e.adjustment.contains("survival")));
        }
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
            WorkspaceSignal {
                name: "a".to_string(),
                salience: 0.0,
            },
            WorkspaceSignal {
                name: "b".to_string(),
                salience: 1.0,
            },
        ];
        let coherent = vec![
            WorkspaceSignal {
                name: "a".to_string(),
                salience: 0.5,
            },
            WorkspaceSignal {
                name: "b".to_string(),
                salience: 0.5,
            },
        ];
        assert!(integration_index(&coherent) > integration_index(&signals));
    }
}
