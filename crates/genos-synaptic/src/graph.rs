use std::collections::HashMap;

/// Configuration de la plasticité synaptique (STDP & Homéostasie).
pub struct PlasticityConfig {
    pub a_plus: f32,
    pub a_minus: f32,
    pub tau_plus: f32,
    pub tau_minus: f32,
    pub prune_threshold: f32,
    pub target_activity: f32,
    pub scaling_gamma: f32,
}

/// Graphe de mémoire associative simulant la plasticité synaptique.
///
/// Implémente la règle STDP (Spike-Timing Dependent Plasticity) pour lier
/// causalement les concepts mémorisés (LTP/LTD) ainsi que le scaling de
/// Turrigiano pour prévenir la saturation du contexte par des nœuds hyperactifs.
pub struct SynapticMemoryGraph {
    pub weights: HashMap<(String, String), f32>,
    pub config: PlasticityConfig,
}

impl SynapticMemoryGraph {
    pub fn new(config: PlasticityConfig) -> Self {
        Self {
            weights: HashMap::new(),
            config,
        }
    }

    /// Applique la plasticité STDP sur un couple de nœuds.
    ///
    /// Renforce la connexion si la causalité est positive (`delta_t >= 0`) et
    /// la déprime si elle est négative (LTD).
    pub fn apply_stdp(&mut self, pair: (&str, &str), delta_t_ms: i64) {
        let (pre_id, post_id) = pair;
        let key = (pre_id.to_string(), post_id.to_string());
        let current_w = *self.weights.get(&key).unwrap_or(&0.5);

        let new_w = if delta_t_ms >= 0 {
            let dw = self.config.a_plus * (-(delta_t_ms as f32) / self.config.tau_plus).exp();
            (current_w + dw).min(10.0)
        } else {
            let dw = self.config.a_minus * ((delta_t_ms as f32) / self.config.tau_minus).exp();
            (current_w - dw).max(0.0)
        };

        self.weights.insert(key, new_w);
    }

    /// Déclenche la phase de sommeil (élagage et scaling homéostatique).
    ///
    /// Applique la mise à l'échelle de Turrigiano sur l'activité synaptique entrante
    /// et supprime les liaisons inférieures à `prune_threshold`.
    pub fn prune_and_scale(&mut self) {
        let mut in_activity: HashMap<String, f32> = HashMap::new();
        for ((_, post), w) in &self.weights {
            *in_activity.entry(post.clone()).or_insert(0.0) += *w;
        }

        for ((_, post), w) in self.weights.iter_mut() {
            let total_act = in_activity.get(post).copied().unwrap_or(0.0);
            let scale_factor =
                (self.config.target_activity / total_act.max(1e-6)).powf(self.config.scaling_gamma);
            *w = (*w * scale_factor).clamp(0.0, 10.0);
        }

        self.weights
            .retain(|_, &mut w| w >= self.config.prune_threshold);
    }
}
