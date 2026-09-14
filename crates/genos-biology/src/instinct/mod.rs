//! Comportements innés pré-câblés : stimulus signe, mécanisme déclencheur
//! inné (IRM) et Patron d'Action Fixe (PAF).
//!
//! Un instinct est un programme hérité et verrouillé au développement, qui
//! s'exécute par une voie rapide `Stimulus -> IRM -> PAF` sans délibération du
//! modèle de langage. Il ne crée ni ne modifie de liaison synaptique : les
//! hormones ne font que déplacer son seuil et son gain. Voir
//! `docs/01-concepts/instinct.md` et `docs/adr/0004-instinct-innate-circuits.md`.

pub mod innate_releasing;
pub mod paf;
pub mod sign_stimulus;

pub use innate_releasing::{HormoneState, InnateReleasingMechanism, TriggerEvaluation};
pub use paf::{ExecutionContext, FixedActionPattern, InstinctOutcome, MotorStep};
pub use sign_stimulus::{Modality, SignStimulus, StimulusField};

use genos_genome::Gene;
pub use genos_genome::INSTINCT_LOCUS_PREFIX;
use serde::{Deserialize, Serialize};

/// Contexte complet d'une exécution instinctive.
pub struct InstinctRunContext<'a> {
    pub field: &'a StimulusField,
    pub hormones: &'a HormoneState,
    pub execution: &'a ExecutionContext,
}

/// Programme comportemental inné, verrouillé au développement et hérité.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstinctProgram {
    pub id: String,
    pub releasing_mechanism: InnateReleasingMechanism,
    pub paf: FixedActionPattern,
    pub developmentally_locked: bool,
}

impl InstinctProgram {
    /// `id` doit être un locus complet, par exemple `LOCUS_INSTINCT_FORAGE_RETURN`.
    pub fn new(
        id: &str,
        releasing_mechanism: InnateReleasingMechanism,
        paf: FixedActionPattern,
    ) -> Self {
        Self {
            id: id.to_string(),
            releasing_mechanism,
            paf,
            developmentally_locked: true,
        }
    }

    pub fn is_locked(&self) -> bool {
        self.developmentally_locked
    }

    /// Encode le programme en gène verrouillé (phase 1 : réutilise `Gene`).
    pub fn to_gene(&self) -> Gene {
        let instruction = self
            .paf
            .steps
            .iter()
            .map(|step| format!("{}::{}", step.tool, step.action))
            .collect::<Vec<String>>()
            .join("|");
        let mut gene = Gene::new(&self.id, &instruction);
        gene.developmentally_locked = true;
        gene
    }

    /// Déclenche et exécute le PAF, ou explique le non-déclenchement / veto.
    pub fn run(&self, ctx: &InstinctRunContext) -> InstinctOutcome {
        let evaluation = self.releasing_mechanism.evaluate(ctx.field, ctx.hormones);
        if !evaluation.released {
            return InstinctOutcome::NotTriggered {
                salience: evaluation.salience,
                threshold: evaluation.threshold,
            };
        }
        if !ctx.execution.is_permissive() {
            return InstinctOutcome::Blocked {
                reason: "Internal state not permissive".to_string(),
            };
        }
        let mut executed = 0;
        for (index, step) in self.paf.steps.iter().enumerate() {
            let authorized = ctx.execution.is_tool_authorized(&step.tool);
            if step.requires_permission && !authorized {
                return InstinctOutcome::Interrupt {
                    at_step: index,
                    reason: format!("Tool not authorized: {}", step.tool),
                };
            }
            executed += 1;
        }
        InstinctOutcome::Complete {
            steps_executed: executed,
            gain: evaluation.execution_gain,
        }
    }
}

/// Vrai si le locus est un programme instinctif (préfixe réservé).
pub fn is_instinct_locus(locus: &str) -> bool {
    locus.starts_with(INSTINCT_LOCUS_PREFIX)
}

/// Bibliothèque des instincts d'une espèce.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct InstinctLibrary {
    pub programs: Vec<InstinctProgram>,
}

impl InstinctLibrary {
    pub fn new() -> Self {
        Self {
            programs: Vec::new(),
        }
    }

    pub fn register(mut self, program: InstinctProgram) -> Self {
        self.programs.push(program);
        self
    }

    pub fn find(&self, locus: &str) -> Option<&InstinctProgram> {
        self.programs.iter().find(|program| program.id == locus)
    }

    pub fn len(&self) -> usize {
        self.programs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.programs.is_empty()
    }
}

#[cfg(test)]
mod tests;
