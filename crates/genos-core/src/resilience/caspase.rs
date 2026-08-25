//! Caspase cascade: ordered, non-necrotic agent termination.
//!
//! Transposition of the apoptosis execution machinery:
//! - **Intrinsic pathway** (mitochondrial/nociception): internal stress signals
//!   (semantic loops, entropy collapse) activate the initiator caspase-9.
//! - **Extrinsic pathway** (FasR/TNFR): an external death ligand — the
//!   supervised kill — activates the initiator caspase-8.
//! - **Execution**: initiators arm the executor caspases 3/7 which commit the
//!   cell to ordered death (clean shutdown, never chaotic necrosis).
//!
//! Reference design: `docs/3-features-and-domain/resilience/apoptosis.md`.

use serde::{Deserialize, Serialize};

/// Typed reason carried by every death signal (auditable, never "misc").
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApoptosisReason {
    /// Unrecoverable reasoning loop detected.
    ReasoningLoop,
    /// Catastrophic security-invariant breach.
    InvariantBreach,
    /// Critical entropy collapse of the cognitive state.
    EntropyCollapse,
    /// Explicit operator decision routed through the death receptor.
    SupervisedKill,
}

/// Origin of the death signal, mirroring the two biological initiation routes.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeathPathway {
    /// Internal nociception: divergence, loops, context pollution.
    Intrinsic,
    /// External death ligand (FasR/TNFR analogue): supervised kill order.
    Extrinsic,
}

/// Initiator caspases gate commitment; they are the only arbiters allowed
/// to arm executors.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum InitiatorCaspase {
    /// Caspase-9 analogue: intrinsic stress route.
    Caspase9,
    /// Caspase-8 analogue: extrinsic death-receptor route.
    Caspase8,
}

impl InitiatorCaspase {
    pub fn for_pathway(pathway: &DeathPathway) -> Self {
        match pathway {
            DeathPathway::Intrinsic => InitiatorCaspase::Caspase9,
            DeathPathway::Extrinsic => InitiatorCaspase::Caspase8,
        }
    }
}

/// Executor caspases that dismantle the cell in an ordered fashion.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutorCaspase {
    /// Caspase-3 analogue: releases clean-shutdown duties.
    Caspase3,
    /// Caspase-7 analogue: seals sandboxes and locks.
    Caspase7,
}

const ALL_EXECUTORS: [ExecutorCaspase; 2] = [ExecutorCaspase::Caspase3, ExecutorCaspase::Caspase7];

/// A death signal entering the cascade.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DeathSignal {
    pub pathway: DeathPathway,
    pub reason: ApoptosisReason,
    /// Strength in [0, 1]; below the activation threshold the signal decays
    /// instead of committing (survival-pathway check, PI3K/Akt analogue).
    pub intensity: f32,
}

/// Outcome of feeding a signal into the cascade.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum CascadeOutcome {
    /// Signal too weak: cell survives, no executor armed.
    Survived,
    /// Full ordered execution completed with the listed steps.
    Committed(ApoptosisExecution),
}

/// Structured report of an executed apoptosis.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ApoptosisExecution {
    pub pathway: DeathPathway,
    pub reason: ApoptosisReason,
    pub initiator: InitiatorCaspase,
    pub executors_fired: Vec<ExecutorCaspase>,
}

/// Default activation threshold: weak signals must not commit a cell.
pub const DEFAULT_ACTIVATION_THRESHOLD: f32 = 0.5;

/// Runs one death signal through the caspase cascade.
pub fn execute_cascade(
    signal: &DeathSignal,
    activation_threshold: f32,
) -> CascadeOutcome {
    if !(signal.intensity >= activation_threshold) {
        return CascadeOutcome::Survived;
    }
    let initiator = InitiatorCaspase::for_pathway(&signal.pathway);
    // Les initiateurs arment les exécuteurs dans l'ordre : 3 puis 7.
    CascadeOutcome::Committed(ApoptosisExecution {
        pathway: signal.pathway.clone(),
        reason: signal.reason.clone(),
        initiator,
        executors_fired: ALL_EXECUTORS.to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signal(pathway: DeathPathway, reason: ApoptosisReason, intensity: f32) -> DeathSignal {
        DeathSignal {
            pathway,
            reason,
            intensity,
        }
    }

    #[test]
    fn intrinsic_stress_uses_caspase_nine() {
        let s = signal(DeathPathway::Intrinsic, ApoptosisReason::ReasoningLoop, 0.9);
        match execute_cascade(&s, DEFAULT_ACTIVATION_THRESHOLD) {
            CascadeOutcome::Committed(execution) => {
                assert_eq!(execution.initiator, InitiatorCaspase::Caspase9);
                assert_eq!(execution.pathway, DeathPathway::Intrinsic);
                assert_eq!(execution.reason, ApoptosisReason::ReasoningLoop);
                assert_eq!(execution.executors_fired.len(), 2);
            }
            other => panic!("expected committed execution, got {other:?}"),
        }
    }

    #[test]
    fn supervised_kill_uses_death_receptor_route() {
        let s = signal(DeathPathway::Extrinsic, ApoptosisReason::SupervisedKill, 0.6);
        match execute_cascade(&s, DEFAULT_ACTIVATION_THRESHOLD) {
            CascadeOutcome::Committed(execution) => {
                assert_eq!(execution.initiator, InitiatorCaspase::Caspase8);
                assert_eq!(execution.reason, ApoptosisReason::SupervisedKill);
            }
            other => panic!("expected committed execution, got {other:?}"),
        }
    }

    #[test]
    fn weak_signals_do_not_commit_the_cell() {
        let strong_reason = ApoptosisReason::InvariantBreach;
        let s = signal(DeathPathway::Intrinsic, strong_reason, 0.2);
        assert_eq!(
            execute_cascade(&s, DEFAULT_ACTIVATION_THRESHOLD),
            CascadeOutcome::Survived,
            "below-threshold signals decay instead of killing"
        );
    }

    #[test]
    fn threshold_is_inclusive_and_executors_fire_in_order() {
        let s = signal(DeathPathway::Intrinsic, ApoptosisReason::EntropyCollapse, DEFAULT_ACTIVATION_THRESHOLD);
        match execute_cascade(&s, DEFAULT_ACTIVATION_THRESHOLD) {
            CascadeOutcome::Committed(e) => assert_eq!(
                e.executors_fired,
                vec![ExecutorCaspase::Caspase3, ExecutorCaspase::Caspase7]
            ),
            other => panic!("expected committed execution at exact threshold, got {other:?}"),
        }
    }
}
