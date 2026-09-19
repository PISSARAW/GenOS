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
use serde_json::{json, Value};

pub trait InstinctActionExecutor: Send {
    fn execute(&mut self, step: &MotorStep) -> Result<InstinctActionReceipt, String>;
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstinctActionReceipt {
    pub execution_id: String,
    pub evidence_ref: String,
    pub result: Value,
}

/// Trace d'une activation instinctive évaluée lors d'un tick.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstinctActivation {
    pub locus: String,
    pub evaluation: genos_biology::instinct::TriggerEvaluation,
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
    pub action_executor: Option<Box<dyn InstinctActionExecutor>>,
    pub authorized_tools: Vec<String>,
}

impl Default for InstinctState {
    fn default() -> Self {
        Self {
            library: default_library(),
            last: Vec::new(),
            volition: VolitionState::default(),
            last_reflex: None,
            last_desire_expression: None,
            action_executor: None,
            authorized_tools: Vec::new(),
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

fn execution_context(authorized_tools: &[String]) -> ExecutionContext {
    ExecutionContext::new(authorized_tools.to_vec(), 100.0)
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
    /// Enregistre l'adaptateur hôte qui exécute les étapes PAF autorisées.
    pub fn set_instinct_action_executor(&mut self, executor: Box<dyn InstinctActionExecutor>) {
        self.instincts.action_executor = Some(executor);
    }

    /// Définit les outils déjà autorisés par la politique de l'agent/hôte.
    pub fn set_instinct_authorized_tools(&mut self, tools: Vec<String>) {
        self.instincts.authorized_tools = tools;
    }

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
        let execution = execution_context(&self.instincts.authorized_tools);
        let programs = self.instincts.library.programs.clone();
        let mut activations: Vec<InstinctActivation> = programs.iter().map(|program| {
                let ctx = InstinctRunContext {
                    field: &field,
                    hormones: &hormones,
                    execution: &execution,
                };
                let evaluation = program.releasing_mechanism.evaluate(&field, &hormones);
                InstinctActivation {
                    locus: program.id.clone(),
                    evaluation,
                    outcome: program.run(&ctx),
                }
            })
            .collect();
        for (program, activation) in programs.iter().zip(&mut activations) {
            if let InstinctOutcome::Complete { gain, .. } = &activation.outcome {
                activation.outcome = self.dispatch_instinct_steps(program, *gain);
            }
        }
        for (program, activation) in programs.iter().zip(&activations) {
            if activation.evaluation.released {
                self.record_event("INSTINCT_TRIGGER", json!({
                    "locus": activation.locus, "evaluation": activation.evaluation,
                    "stimuli": field.readings, "hormones": hormones
                }));
            }
            let event_type = match activation.outcome {
                InstinctOutcome::Complete { .. } => "INSTINCT_COMPLETE",
                InstinctOutcome::Interrupt { .. } => "INSTINCT_INTERRUPT",
                InstinctOutcome::Blocked { .. } => "INSTINCT_BLOCKED",
                InstinctOutcome::NotTriggered { .. } => continue,
            };
            self.record_event(
                event_type,
                json!({ "locus": activation.locus, "outcome": activation.outcome, "paf": program.paf.name }),
            );
        }
        self.instincts.last = activations;
    }

    fn dispatch_instinct_steps(&mut self, program: &InstinctProgram, gain: f64) -> InstinctOutcome {
        let mut results = Vec::new();
        let mut failure = None;
        {
            let Some(executor) = self.instincts.action_executor.as_deref_mut() else {
                return InstinctOutcome::Blocked {
                    reason: "No external instinct action executor is registered".to_string(),
                };
            };
            for (index, step) in program.paf.steps.iter().enumerate() {
                match executor.execute(step) {
                    Ok(receipt) if !receipt.execution_id.trim().is_empty() && !receipt.evidence_ref.trim().is_empty() => {
                        results.push((index, true, json!({
                            "execution_id": receipt.execution_id,
                            "evidence_ref": receipt.evidence_ref,
                            "result": receipt.result
                        })));
                    }
                    Ok(_) => {
                        let reason = "Executor returned a receipt without execution_id/evidence_ref".to_string();
                        results.push((index, false, json!({ "reason": reason })));
                        failure = Some((index, reason));
                        break;
                    }
                    Err(reason) => {
                        results.push((index, false, json!({ "reason": reason })));
                        failure = Some((index, reason));
                        break;
                    }
                }
            }
        }
        for (index, succeeded, detail) in results {
            let step = &program.paf.steps[index];
            let event_type = if succeeded { "INSTINCT_ACTION_EXECUTED" } else { "INSTINCT_ACTION_REFUSED" };
            self.record_event(event_type, json!({
                "locus": program.id, "paf": program.paf.name, "step": index,
                "tool": step.tool, "action": step.action, "result": detail
            }));
        }
        if let Some((index, reason)) = failure {
            return InstinctOutcome::Interrupt { at_step: index, reason };
        }
        InstinctOutcome::Complete {
            steps_executed: program.paf.steps.len(),
            gain,
        }
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
    fn runtime_without_action_permissions_vetoes_dispatch() {
        let mut eco = GenosEcosystem::new("Instinct_Unit");
        let state = WorldState {
            threat: 0.9,
            ..WorldState::default()
        };
        eco.run_instincts(&state);
        assert_eq!(eco.last_instincts().len(), 1);
        assert!(matches!(
            eco.last_instincts()[0].outcome,
            InstinctOutcome::Interrupt { .. }
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
