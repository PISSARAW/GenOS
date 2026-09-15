//! Câblage automatique des instincts dans la boucle cognitive.
//!
//! À chaque `tick` (et donc à chaque itération de `run_autonomous`), l'écosystème
//! construit un `StimulusField` à partir de l'état observé, module le seuil par
//! l'état hormonal dérivé, puis déclenche et exécute les `InstinctProgram`
//! enregistrés dont la saillance franchit le seuil. Les activations non
//! triviales sont journalisées comme événements `INSTINCT`. Voir docs/01-concepts/instinct.md.

use crate::volition::VolitionState;
use crate::GenosEcosystem;
use crate::planner::WorldState;
use genos_biology::instinct::{
    ExecutionContext, FixedActionPattern, HormoneState, InnateReleasingMechanism, InstinctLibrary,
    InstinctOutcome, InstinctProgram, InstinctRunContext, Modality, MotorStep, SignStimulus,
    StimulusField,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

/// Trace d'une activation instinctive évaluée lors d'un tick.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstinctActivation {
    pub locus: String,
    pub outcome: InstinctOutcome,
}

/// État instinctif de l'écosystème : bibliothèque innée, dernières activations,
/// et volition endogène (buts autonomes hors mission contractuelle).
pub struct InstinctState {
    pub library: InstinctLibrary,
    pub last: Vec<InstinctActivation>,
    /// Survie pure + désir libre, avec mémoire d'un tick à l'autre.
    pub volition: VolitionState,
    pub last_reflex: Option<String>,
    pub last_desire_expression: Option<String>,
}

impl Default for InstinctState {
    fn default() -> Self {
        Self {
            library: default_library(),
            last: Vec::new(),
            volition: VolitionState::default(),
            last_reflex: None,
            last_desire_expression: None,
        }
    }
}

/// Instinct inné de défense du périmètre, actif dès la naissance de l'espèce.
fn default_library() -> InstinctLibrary {
    InstinctLibrary::new().register(InstinctProgram::new(
        "LOCUS_INSTINCT_PERIMETER_DEFENSE",
        InnateReleasingMechanism::new(Modality::Error, "threat_detected", 0.5),
        FixedActionPattern::new(
            "perimeter_defense",
            vec![
                MotorStep::new("raise_alarm", "genos_biomimicry").auto(),
                MotorStep::new("neutralize_virion", "genos_biomimicry"),
            ],
        ),
    ))
}

fn execution_context() -> ExecutionContext {
    ExecutionContext::new(
        vec!["genos_biomimicry".to_string(), "genos_snapshot".to_string()],
        100.0,
    )
}

/// Traduit l'état du monde en stimuli signes.
fn stimulus_field_from(state: &WorldState) -> StimulusField {
    let mut field = StimulusField::new();
    if state.threat > 0.0 || state.adversary {
        field = field.push(SignStimulus::new(
            Modality::Error,
            "threat_detected",
            state.threat.max(0.5),
        ));
    }
    if state.diseased > 0 || state.traitor {
        field = field.push(SignStimulus::new(Modality::Error, "integrity_breach", 0.9));
    }
    if state.budget_pressure >= 0.7 {
        field = field.push(SignStimulus::new(
            Modality::Pheromone,
            "resource_exhausted",
            state.budget_pressure,
        ));
    }
    field
}

/// Dérive l'état hormonal depuis l'état du monde (soin, territorialité, stress).
fn hormone_state_from(state: &WorldState) -> HormoneState {
    HormoneState {
        oxytocin: (1.0 - state.stress).clamp(0.0, 1.0) * 0.5,
        prolactin: 0.0,
        testosterone: state.threat.clamp(0.0, 1.0),
        cortisol: state.stress.clamp(0.0, 1.0),
        dopamine: 0.0,
    }
}

impl GenosEcosystem {
    /// Enregistre un instinct supplémentaire dans la bibliothèque de l'espèce.
    pub fn register_instinct(&mut self, program: InstinctProgram) {
        self.instincts.library.programs.push(program);
    }

    /// Dernières activations instinctives évaluées (une par instinct).
    pub fn last_instincts(&self) -> &[InstinctActivation] {
        &self.instincts.last
    }

    /// Stimuli signes dérivés de l'état observable courant.
    pub fn stimulus_field(&self) -> StimulusField {
        stimulus_field_from(&self.observe())
    }

    /// État hormonal dérivé de l'état observable courant.
    pub fn hormone_state(&self) -> HormoneState {
        hormone_state_from(&self.observe())
    }

    /// Évalue et exécute les instincts déclenchés pour l'état donné.
    pub(crate) fn run_instincts(&mut self, state: &WorldState) {
        let field = stimulus_field_from(state);
        let hormones = hormone_state_from(state);
        let execution = execution_context();
        let activations: Vec<InstinctActivation> = self
            .instincts
            .library
            .programs
            .iter()
            .map(|program| {
                let ctx = InstinctRunContext {
                    field: &field,
                    hormones: &hormones,
                    execution: &execution,
                };
                InstinctActivation {
                    locus: program.id.clone(),
                    outcome: program.run(&ctx),
                }
            })
            .collect();
        for activation in &activations {
            if !matches!(activation.outcome, InstinctOutcome::NotTriggered { .. }) {
                self.record_event(
                    "INSTINCT",
                    json!({ "locus": activation.locus, "outcome": activation.outcome }),
                );
            }
        }
        self.instincts.last = activations;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threat_state_emits_sign_stimulus() {
        let state = WorldState {
            threat: 0.8,
            ..WorldState::default()
        };
        let field = stimulus_field_from(&state);
        assert!(field.readings.iter().any(|s| s.signature == "threat_detected"));
    }

    #[test]
    fn budget_pressure_emits_resource_stimulus() {
        let state = WorldState {
            budget_pressure: 0.9,
            ..WorldState::default()
        };
        let field = stimulus_field_from(&state);
        assert!(field
            .readings
            .iter()
            .any(|s| s.signature == "resource_exhausted"));
    }

    #[test]
    fn run_instincts_triggers_defense_on_threat() {
        let mut eco = GenosEcosystem::new("Instinct_Unit");
        let state = WorldState {
            threat: 0.9,
            ..WorldState::default()
        };
        eco.run_instincts(&state);
        assert_eq!(eco.last_instincts().len(), 1);
        assert!(matches!(
            eco.last_instincts()[0].outcome,
            InstinctOutcome::Complete { .. }
        ));
    }

    #[test]
    fn calm_state_does_not_trigger() {
        let mut eco = GenosEcosystem::new("Calm_Unit");
        eco.run_instincts(&WorldState::default());
        assert!(matches!(
            eco.last_instincts()[0].outcome,
            InstinctOutcome::NotTriggered { .. }
        ));
    }
}
