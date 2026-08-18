use genos_core::divergence::{DivergenceDetector, DivergenceNature};
use genos_core::loop_detection::IterationSnapshot;
use serde::{Deserialize, Serialize};

/// Rapport généré après l'évaluation d'une expérience causale forked.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExperimentMergeReport {
    pub golden_branch_id: String,
    pub experimental_branch_id: String,
    pub fork_step: usize,
    pub success: bool,
    /// Indique si la nouvelle trajectoire satisfait mieux les critères d'évaluation.
    pub improved_metrics: bool,
}

/// L'Orchestrateur asynchrone responsable du lancement des expériences de Causal Replay.
pub struct CausalReplayOrchestrator {
    pub detector: DivergenceDetector,
}

impl Default for CausalReplayOrchestrator {
    fn default() -> Self {
        Self {
            detector: DivergenceDetector::default(),
        }
    }
}

impl CausalReplayOrchestrator {
    pub fn new() -> Self {
        Self::default()
    }

    /// Orchestre une expérience de Causal Replay en direct.
    /// Compare un flux d'exécution "Golden" avec la réalité courante de l'Agent, 
    /// et invoque `genos_fork` de manière dynamique au moment critique.
    pub async fn run_live_causal_experiment(
        &self,
        golden_branch_id: &str,
        golden_stream: &[IterationSnapshot],
        is_experiment: bool,
    ) -> Result<ExperimentMergeReport, String> {
        let mut current_step = 0;
        let mut experimental_branch_id = golden_branch_id.to_string(); // Initialement sur la même branche
        
        let mut fork_triggered = false;
        let mut fork_step = 0;

        // Boucle principale (Simulation d'exécution asynchrone live)
        for golden_snapshot in golden_stream {
            current_step += 1;
            
            // Si on a déjà forké, on laisse l'agent continuer sur sa nouvelle branche isolée (Branche B)
            if fork_triggered {
                // L'agent exécute sa nouvelle route causale sans contrainte...
                continue;
            }

            // --- SIMULATION DU COMPORTEMENT DE L'AGENT ---
            // (Dans le véritable runtime, l'Agent générerait ici sa nouvelle IterationSnapshot)
            let current_snapshot = self.poll_agent_live_state(current_step, golden_snapshot);

            // --- DÉTECTION DE DIVERGENCE ---
            if let Err(divergence_event) = self.detector.check_step(
                current_step,
                golden_snapshot,
                &current_snapshot,
                is_experiment,
            ) {
                match divergence_event.nature {
                    DivergenceNature::Intentional => {
                        // 1. L'Instant du Fork !
                        fork_triggered = true;
                        fork_step = current_step;
                        experimental_branch_id = format!("{}_experiment_fork_at_step_{}", golden_branch_id, current_step);
                        
                        // (Ici le système invoque l'API réelle `genos_fork` pour isoler la branche B)
                    }
                    DivergenceNature::UnintentionalNoise => {
                        // Bruit détecté : Le système déclencherait le Self-Healing ici.
                        return Err(format!(
                            "Bruit non-intentionnel détecté à l'étape {}. Tentative de Self-Healing requise.",
                            current_step
                        ));
                    }
                }
            }
        }

        // --- ÉVALUATION ET MERGE DÉCISIF ---
        if fork_triggered {
            // L'agent a terminé d'explorer sa Branche B. On lance l'évaluation (Trajectory Evaluation)
            let improved_metrics = self.evaluate_trajectory(&experimental_branch_id);
            
            Ok(ExperimentMergeReport {
                golden_branch_id: golden_branch_id.to_string(),
                experimental_branch_id,
                fork_step,
                success: true,
                improved_metrics,
            })
        } else {
            // Pas de divergence, l'expérience n'a pas déclenché de fork
            Ok(ExperimentMergeReport {
                golden_branch_id: golden_branch_id.to_string(),
                experimental_branch_id: golden_branch_id.to_string(),
                fork_step: 0,
                success: true,
                improved_metrics: false,
            })
        }
    }

    /// (Mock Interne) Simule la lecture de l'état asynchrone de l'Agent.
    fn poll_agent_live_state(&self, _step: usize, golden_snapshot: &IterationSnapshot) -> IterationSnapshot {
        // En conditions normales, renvoie la même chose que le golden (Déterminisme parfait)
        golden_snapshot.clone()
    }

    /// (Mock Interne) Simule l'évaluation d'une trajectoire.
    fn evaluate_trajectory(&self, _branch_id: &str) -> bool {
        // En vrai, invoque `genos_analyze` et exécute les tests unitaires.
        true
    }
}
