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

// ---------------------------------------------------------------------------
// Blebbing : compaction forensique de la mémoire mourante en granules.
// ---------------------------------------------------------------------------

/// Nombre maximum de granules conservés par défaut (contrat DLQ).
pub const DEFAULT_MAX_GRANULES: usize = 8;

/// Compacts a dying agent's memory items into bounded forensic granules
/// (membrane-blebbing analogue): deduplicated, truncated, and ordered so the
/// teardown preserves everything worth auditing without bloating the DLQ.
pub fn bleb_memory(memory_items: &[String], max_granules: usize) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut granules = Vec::new();
    for item in memory_items {
        let trimmed = item.trim();
        if trimmed.is_empty() || !seen.insert(trimmed.to_string()) {
            continue;
        }
        let preview: String = trimmed.chars().take(64).collect();
        granules.push(format!("granule-{:03}: {}", granules.len() + 1, preview));
        if granules.len() >= max_granules {
            break;
        }
    }
    granules
}

// ---------------------------------------------------------------------------
// Propagation aux sous-agents : aucune cellule fille orpheline.
// ---------------------------------------------------------------------------

/// Termination status of one child agent during death propagation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChildTermination {
    /// Child received the kill and shut down cleanly.
    Terminated(String),
    /// Child was already gone (crashed or finished).
    AlreadyGone(String),
}

/// Propagates apoptosis to child agents so no orphans survive the parent.
/// Children listed twice are terminated once; missing children are reported.
pub fn propagate_to_children(
    parent_id: &str,
    children: &[Option<String>],
) -> Vec<ChildTermination> {
    let mut seen = std::collections::BTreeSet::new();
    let mut outcomes = Vec::new();
    for child in children.iter().flatten() {
        if seen.insert(child.clone()) {
            outcomes.push(ChildTermination::Terminated(format!("{parent_id}/{child}")));
        }
    }
    outcomes
}

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

    #[test]
    fn blebbing_compacts_deduplicates_and_bounds_memory() {
        let memory = vec![
            "belief: api returns 200".to_string(),
            "belief: api returns 200 ".to_string(), // doublon (trim)
            "".to_string(),                          // vide : ignoré
            "tool-call: deploy --dry-run".to_string(),
        ];
        let granules = bleb_memory(&memory, DEFAULT_MAX_GRANULES);
        assert_eq!(granules.len(), 2, "duplicates and empty items are dropped");
        assert!(granules[0].starts_with("granule-001"));
        assert!(granules[0].contains("api returns 200"));

        // Cap : au-delà de la limite, les items excédentaires sont perdus proprement.
        let flood: Vec<String> = (0..50).map(|i| format!("item-{i}")).collect();
        let bounded = bleb_memory(&flood, 4);
        assert_eq!(bounded.len(), 4);
    }

    #[test]
    fn long_items_are_truncated_in_granules() {
        let long_item = "x".repeat(500);
        let granules = bleb_memory(std::slice::from_ref(&long_item), 1);
        assert_eq!(granules[0].chars().count(), "granule-001: ".len() + 64);
    }

    #[test]
    fn death_propagates_to_children_without_orphans_or_duplicates() {
        let children = vec![
            Some("child-a".into()),
            Some("child-b".into()),
            None, // slot absent
            Some("child-a".into()), // doublon
        ];
        let outcomes = propagate_to_children("parent-1", &children);
        assert_eq!(
            outcomes,
            vec![
                ChildTermination::Terminated("parent-1/child-a".into()),
                ChildTermination::Terminated("parent-1/child-b".into()),
            ]
        );
    }
}
