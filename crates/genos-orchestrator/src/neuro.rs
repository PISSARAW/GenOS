//! Exploitation du domaine neurobiologique : synapses, soma, plasticité.

use genos_biology::neurobiology::{NervousSystem, NeuroSignal, Neurotransmitter};

/// Système nerveux local piloté par l'orchestrateur (voie neuro-endocrine).
pub struct NeuroLab {
    pub system: NervousSystem,
}

impl NeuroLab {
    pub fn new(node_id: &str) -> Self {
        Self {
            system: NervousSystem::new(node_id),
        }
    }

    /// Réception synaptique : un neurotransmetteur arrive sur les dendrites.
    pub fn receive(&mut self, source_id: &str, transmitter: Neurotransmitter, amount: f64) {
        self.system.receive_neurotransmitter(
            source_id,
            &NeuroSignal {
                transmitter,
                amount,
            },
        );
    }

    /// Intégration somatique : renvoie les potentiels d'action émis.
    pub fn fire(&mut self) -> Option<Vec<(String, Neurotransmitter, f64)>> {
        self.system.process_soma()
    }

    /// Plasticité synaptique (renforcement / élagage).
    pub fn apply_plasticity(&mut self) {
        self.system.apply_neuroplasticity();
    }

    pub fn resting_potential(&self) -> f64 {
        self.system.soma.resting_potential
    }

    pub fn current_potential(&self) -> f64 {
        self.system.soma.current_potential
    }

    pub fn myelination(&self) -> f64 {
        self.system.axon.myelination_level
    }
}
