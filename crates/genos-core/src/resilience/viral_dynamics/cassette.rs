//! Prophage cassettes: lysogenic skill storage with superinfection exclusion.

use serde::{Deserialize, Serialize};

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
    /// already resides there (**superinfection exclusion**).
    ///
    /// `theta_exclusion` is the RBF affinity above which an incoming cassette
    /// is considered redundant with a resident one.
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
            super::rbf_affinity(&r.failure_mode_signature, &cassette.failure_mode_signature, gamma)
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

/// Reasons an incoming capsule or cassette was refused.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Superinjection {
    LocusFull,
    ExcludedBy(String),
}

/// Signed unit of horizontally transferable capability (transduction).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TransductionCapsule {
    pub capsule_id: String,
    pub provenance_genome: String,
    pub payload_delta: String,
    pub failure_mode_signature: Vec<f32>,
    /// Hash of the sandboxed evaluation artifact proving the payload works.
    /// Empty proofs are rejected: transduction changes *who offers* a change,
    /// never whether it is reviewed.
    pub evaluation_proof_hash: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integration_is_rejected_when_locus_full() {
        let mut locus = ProphageLocus::new();
        for i in 0..MAX_CASSETTES_PER_LINEAGE {
            assert!(locus
                .integrate(cassette(format!("c{i}"), vec![i as f32]), 1.0, 0.99)
                .is_ok());
        }
        assert_eq!(
            locus.integrate(cassette("extra", vec![99.0]), 1.0, 0.99),
            Err(Superinjection::LocusFull)
        );
    }

    #[test]
    fn superinfection_exclusion_blocks_equivalent_cassette() {
        let mut locus = ProphageLocus::new();
        locus
            .integrate(cassette("resident", vec![0.1, 0.2]), 1.0, 0.9)
            .unwrap();
        let twin = cassette("twin", vec![0.1, 0.21]);
        assert_eq!(
            locus.integrate(twin, 1.0, 0.9),
            Err(Superinjection::ExcludedBy("resident".into()))
        );
        assert!(locus.integrate(cassette("novel", vec![5.0, 5.0]), 1.0, 0.9).is_ok());
    }

    #[test]
    fn induction_flips_only_dormant_cassettes_once() {
        let mut locus = ProphageLocus::new();
        locus.integrate(cassette("a", vec![0.0]), 1.0, 0.9).unwrap();
        locus.integrate(cassette("b", vec![1.0]), 1.0, 0.9).unwrap();
        let induced = locus.induce_all();
        assert_eq!(induced.len(), 2);
        assert!(locus.induce_all().is_empty());
    }

    fn cassette(id: impl Into<String>, signature: Vec<f32>) -> SkillCassette {
        let id = id.into();
        SkillCassette {
            cassette_id: id.to_string(),
            payload_delta: format!("payload-{id}"),
            failure_mode_signature: signature,
            state: CassetteState::Dormant,
        }
    }
}
