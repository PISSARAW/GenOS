//! Cell-division primitives for agent capsules.
//!
//! Each biological division mode maps to one runtime primitive with a
//! distinct priority use case:
//!
//! | Biology | Primitive | Priority use case |
//! | --- | --- | --- |
//! | Mitosis | [`mitotic_fork_capsules`] | Redundant parallel execution and majority voting over attested clones |
//! | Binary fission | [`binary_fission_capsules`] | Cheap elastic scale-out of lightweight workers |
//! | Budding | [`bud_capsule`] | Bounded sub-agent delegation (Hayflick-limited) |
//! | Schizogony | [`schizogonic_burst`] | Atomic speculative fan-out of many hypotheses at once |
//! | Meiosis | `breed_genomes` (crate::evolution) | Genome recombination across parent cohorts |
//!
//! Amitosis (direct division without a segregation spindle) is deliberately
//! NOT implemented: an unverified state copy with no replay guarantee is the
//! exact failure mode GenOS exists to prevent. See
//! `docs/research/fr/DIVISION_CELLULAIRE.md` for the anti-pattern write-up.

mod budding;
mod fission;
mod mitosis;
mod schizogony;

pub(crate) use mitosis::{build_daughter_capsule, rollback};

pub use budding::{bud_capsule, BudOutcome, BudSpec, DEFAULT_HAYFLICK_LIMIT};
pub use fission::{binary_fission_capsules, FissionOutcome};
pub use mitosis::{mitotic_fork_capsules, DaughterAttestation, MitosisOutcome};
pub use schizogony::{schizogonic_burst, SchizogonyBurst, SchizogonyBranchSpec};

#[cfg(test)]
mod tests;

use serde::Serialize;

/// Budget actually granted to each daughter after an even split.
pub(crate) fn even_split(total: u64, parts: u32) -> anyhow::Result<u64> {
    if parts == 0 {
        anyhow::bail!("a division requires at least one daughter");
    }
    let share = total / parts as u64;
    if share == 0 {
        anyhow::bail!(
            "parent budget of {total} step(s) cannot fund {parts} daughters; \
             each daughter needs at least one step"
        );
    }
    Ok(share)
}

/// Shared shape of every division outcome so CLI and Studio can render them
/// uniformly.
#[derive(Clone, Debug, Serialize)]
pub struct DivisionReport {
    pub mode: &'static str,
    pub parent_capsule_id: String,
    pub daughter_capsule_ids: Vec<String>,
    pub steps_per_daughter: u64,
}
