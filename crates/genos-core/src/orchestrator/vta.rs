use crate::cell::events::CellEvent;
use crate::neurobiology::Neurotransmitter;
use crate::orchestrator::conscience::ConscienceState;

/// L'Aire Tegmentale Ventrale (VTA)
/// Le Système de Récompense (Reward Model) du GenOS V4.
#[derive(Clone, Debug)]
pub struct VentralTegmentalArea {
    pub basal_dopamine_release: f64,
}

impl Default for VentralTegmentalArea {
    fn default() -> Self {
        Self {
            basal_dopamine_release: 0.1,
        }
    }
}

impl VentralTegmentalArea {
    pub fn new(basal_dopamine_release: f64) -> Self {
        Self {
            basal_dopamine_release,
        }
    }

    /// Évalue un événement cognitif (ou trace) et décide de la quantité de Dopamine/GABA à relâcher.
    pub fn evaluate_event(&self, event: &CellEvent) -> (Neurotransmitter, f64) {
        match event {
            // Heuristiques de succès (Eureka / Progress)
            CellEvent::TaskExecuted { task_name: _, result } if result.contains("SUCCESS") || result.contains("OK") => {
                // LA SIGNALISATION COÛTEUSE (Handicap de Zahavi)
                // Si l'agent prétend avoir réussi ou validé une tâche, mais que son explication
                // (proxy pour la consommation de tokens/énergie) est trop brève (ex: "LGTM", "OK"),
                // c'est un signal trompeur/faible. La VTA le punit au lieu de le récompenser.
                if result.len() < 50 {
                    println!("📉 [VTA - Zahavi] Signal trompeur ou collusion détectée (trop court). Dopamine refusée, GABA sécrété.");
                    (Neurotransmitter::GABA, 10.0)
                } else {
                    (Neurotransmitter::Dopamine, 10.0) // Gros pic de dopamine pour un vrai travail
                }
            }
            CellEvent::Recovered(_) => {
                (Neurotransmitter::Dopamine, 5.0)
            }
            // Heuristiques d'erreur (Prediction Error / Dissonance)
            CellEvent::TaskExecuted { task_name: _, result } if result.contains("ERROR") || result.contains("FAIL") => {
                // Chute de la dopamine, libération de signaux inhibiteurs
                (Neurotransmitter::GABA, 5.0) 
            }
            CellEvent::Hijacked(_) | CellEvent::ApoptosisTriggered(_) | CellEvent::NecrosisTriggered(_) => {
                (Neurotransmitter::GABA, 20.0) // Punition forte
            }
            // Par défaut, maintien du filet basal (on ne punit pas l'inaction mineure)
            _ => (Neurotransmitter::Dopamine, self.basal_dopamine_release),
        }
    }

    /// Analyse la trace entière d'un agent pour calculer la dose totale reçue.
    pub fn process_trace_and_infuse(&self, trace: &[CellEvent], state: &mut ConscienceState) {
        let mut total_dopamine = 0.0;
        let mut total_gaba = 0.0;

        for event in trace.iter() {
            let (transmitter, amount) = self.evaluate_event(event);
            match transmitter {
                Neurotransmitter::Dopamine => total_dopamine += amount,
                Neurotransmitter::GABA => total_gaba += amount,
                _ => {}
            }
        }

        // Absorption par la Conscience
        // La dopamine réduit fortement la dissonance
        state.dissonance_level = (state.dissonance_level - total_dopamine).max(0.0);
        
        // Le GABA (Stress/Punition) augmente la dissonance
        state.dissonance_level += total_gaba;
        
        // Si le pic de dopamine est massif, on déclenche un Eureka
        if total_dopamine > 50.0 {
            state.eureka_moments += 1;
            state.dissonance_level /= 2.0;
        }
    }
}
