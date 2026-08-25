use serde::{Deserialize, Serialize};

use super::viral_dynamics::rbf_affinity;

/// Maximum number of cassettes a single lineage may carry (prophage bloat cap).
pub const MAX_CASSETTES_PER_LINEAGE: usize = 8;

/// Lifecycle state of a cassette integrated at a genome's prophage locus.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CassetteState {
    /// Inert: inherited across forks, no behavioral effect.
    Dormant,
    /// Expressed because stress crossed the induction threshold.
    Induced,
}

/// Immutable unit of capability stored at a prophage locus.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SkillCassette {
    pub cassette_id: String,
    pub payload_delta: String,
    /// Embedding of the failure mode this cassette resolves.
    pub failure_mode_signature: Vec<f32>,
    pub state: CassetteState,
}

/// Per-lineage registry of skill cassettes with a hard capacity cap.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ProphageLocus {
    cassettes: Vec<SkillCassette>,
}

/// Reasons an incoming capsule or cassette was refused.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Superinjection {
    LocusFull,
    ExcludedBy(String),
}

impl ProphageLocus {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cassettes(&self) -> &[SkillCassette] {
        &self.cassettes
    }

    pub fn has_dormant(&self) -> bool {
        self.cassettes.iter().any(|c| c.state == CassetteState::Dormant)
    }

    /// Integrates a cassette unless the locus is full or an equivalent cassette
    /// already resides there (**superinfection exclusion`).
    ///
    /// `theta_exclusion` is the RBF affinity above which an incoming cassette
    /// is considered redundant with a resident one.
    #[allow(clippy::too_many_arguments)]
    pub fn integrate(
        &mut self,
        cassette: SkillCassette,
        gamma: f32,
        theta_exclusion: f32,
    ) -> Result<CassetteState, Superinjection> {
        if self.cassettes.len() >= MAX_CASSETTES_PER_LINEAGE {
            return Err(Superinjection::LocusFull);
        }
        if let Some(resident) = self.cassettes.iter().find(|r| {
            rbf_affinity(&r.failure_mode_signature, &cassette.failure_mode_signature, gamma)
                >= theta_exclusion
        }) {
            return Err(Superinjection::ExcludedBy(resident.cassette_id.clone()));
        }
        let state = CassetteState::Dormant;
        self.cassettes.push(SkillCassette { state, ..cassette });
        Ok(state)
    }

    /// Flips every dormant cassette to `Induced`. Returns the induced ids.
    pub fn induce_all(&mut self) -> Vec<String> {
        self.cassettes
            .iter_mut()
            .filter(|c| c.state == CassetteState::Dormant)
            .map(|c| {
                c.state = CassetteState::Induced;
                c.cassette_id.clone()
            })
            .collect()
    }

    pub fn resident_signatures(&self) -> Vec<Vec<f32>> {
        self.cassettes
            .iter()
            .map(|c| c.failure_mode_signature.clone())
            .collect()
    }
}
