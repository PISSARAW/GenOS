/// Plasticité dépendante du temps (STDP - Spike-Timing-Dependent Plasticity)
/// Utilisée pour ajuster les poids synaptiques de l'arbre MCTS dynamiquement.
pub trait SynapticPlasticity {
    /// Applique la potentialisation à long terme (LTP).
    fn apply_potentiation(weight: f32, delta_t: f32) -> f32;
    
    /// Applique la dépression à long terme (LTD).
    fn apply_depression(weight: f32, delta_t: f32) -> f32;
    
    /// Met à jour le poids globalement en fonction de delta_t.
    fn update_weight(weight: f32, delta_t: f32, lr: f32) -> f32;
}

pub struct StdpModel;

impl SynapticPlasticity for StdpModel {
    fn apply_potentiation(weight: f32, delta_t: f32) -> f32 {
        // Equation standard STDP (LTP) : A_plus * exp(-delta_t / tau_plus)
        let a_plus = 0.1;
        let tau_plus = 20.0;
        let delta_w = a_plus * (-delta_t / tau_plus).exp();
        weight + delta_w
    }

    fn apply_depression(weight: f32, delta_t: f32) -> f32 {
        // Equation standard STDP (LTD) : -A_minus * exp(delta_t / tau_minus)
        // delta_t est négatif ici (post-synaptic spike precedes pre-synaptic)
        let a_minus = 0.12;
        let tau_minus = 20.0;
        let delta_w = -a_minus * (delta_t / tau_minus).exp();
        weight + delta_w
    }

    fn update_weight(weight: f32, delta_t: f32, lr: f32) -> f32 {
        let new_weight = if delta_t > 0.0 {
            Self::apply_potentiation(weight, delta_t)
        } else if delta_t < 0.0 {
            Self::apply_depression(weight, delta_t)
        } else {
            weight
        };
        
        // Application du taux d'apprentissage global (learning rate)
        weight + lr * (new_weight - weight)
    }
}
