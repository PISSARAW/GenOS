use serde::{Deserialize, Serialize};

/// Représente les différentes "portes sensorielles" du cerveau (l'agent).
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Modality {
    /// La vision : ex. la lecture du code source, l'AST, l'interface graphique.
    Visual,
    /// L'ouïe : ex. le flux de logs, les alertes asynchrones, les traces.
    Auditory,
    /// Le toucher : ex. la pression (métriques de performance, usage RAM/CPU).
    Tactile,
}

/// Un signal sensoriel brut arrivant au Colliculus Supérieur.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SensorySignal {
    pub modality: Modality,
    /// Le point d'origine du signal (ex: "module_auth.rs", "server_node_1").
    pub spatial_source: String,
    pub timestamp_ms: u64,
    pub intensity: f32,
}

/// Le Colliculus Supérieur (CS) agit comme un GPS ultra-rapide.
/// Il ne cherche pas à comprendre "quoi" se passe, mais "où" et "quand"
/// plusieurs sens concordent pour générer un réflexe moteur.
#[derive(Clone, Debug)]
pub struct SuperiorColliculus {
    /// La fenêtre de temps (en millisecondes) pour considérer deux signaux comme simultanés.
    pub temporal_window_ms: u64,
    /// Le multiplicateur appliqué lors d'une fusion réussie (ex: vision + ouïe).
    pub fusion_multiplier: f32,
    /// Le seuil d'alerte pour déclencher le mouvement moteur.
    pub activation_threshold: f32,
}

/// La réponse motrice générée par le CS.
#[derive(Clone, Debug, PartialEq)]
pub enum MotorReflex {
    /// Commande "MOUVE-TOUT MAINTENANT vers cette source" (Fixation de l'attention).
    OrientAttention {
        target_location: String,
        priority: f32,
    },
    /// Bruit de fond, pas d'action réflexe requise.
    Ignore,
}

impl SuperiorColliculus {
    pub fn new(temporal_window_ms: u64, fusion_multiplier: f32, activation_threshold: f32) -> Self {
        Self {
            temporal_window_ms,
            fusion_multiplier,
            activation_threshold,
        }
    }

    /// Analyse un lot de signaux bruts pour détecter les coïncidences spatio-temporelles.
    pub fn process_signals(&self, signals: &[SensorySignal]) -> MotorReflex {
        if signals.is_empty() {
            return MotorReflex::Ignore;
        }

        // On cherche le cluster spatio-temporel le plus intense.
        // Pour simplifier (complexité O(N^2) max), on compare chaque paire.
        let mut max_priority = 0.0;
        let mut best_target = String::new();

        for i in 0..signals.len() {
            let sig_a = &signals[i];
            let mut local_intensity = sig_a.intensity;
            let mut modalities_matched = 1;

            for j in (i + 1)..signals.len() {
                let sig_b = &signals[j];

                // Coïncidence Spatiale ET Temporelle
                let is_same_location = sig_a.spatial_source == sig_b.spatial_source;
                let is_simultaneous = sig_a.timestamp_ms.abs_diff(sig_b.timestamp_ms) <= self.temporal_window_ms;
                
                // Intégration multisensorielle : les signaux doivent venir de sens différents
                let is_different_modality = sig_a.modality != sig_b.modality;

                if is_same_location && is_simultaneous && is_different_modality {
                    local_intensity += sig_b.intensity;
                    modalities_matched += 1;
                }
            }

            // Pondération de Fusion : si plusieurs sens confirment l'événement, on multiplie l'importance.
            if modalities_matched > 1 {
                local_intensity *= self.fusion_multiplier;
            }

            if local_intensity > max_priority {
                max_priority = local_intensity;
                best_target = sig_a.spatial_source.clone();
            }
        }

        if max_priority >= self.activation_threshold {
            MotorReflex::OrientAttention {
                target_location: best_target,
                priority: max_priority,
            }
        } else {
            MotorReflex::Ignore
        }
    }
}
