//! Mavirus-style heritable immunity: attack genes harvested by virophages are
//! converted into countermeasure cassettes and integrated at a lineage's
//! prophage locus, making the acquired defense heritable across forks.
//!
//! Reference design: `docs/3-features-and-domain/resilience/virophage.md` (§Mavirus).

use super::virophage::AttackGene;
use super::viral_dynamics::{CassetteState, ProphageLocus, SkillCassette, Superinjection};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Outcome of a single Mavirus integration attempt.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum IntegrationOutcome {
    /// Gene converted into a dormant heritable cassette.
    Integrated(String),
    /// Redundant with a resident cassette (superinfection exclusion).
    ExcludedBy(String),
    /// Prophage locus at capacity.
    LocusFull,
    /// Gene already converted in a previous harvest round.
    AlreadyIntegrated,
}

/// Converts harvested `AttackGene`s into heritable immunity cassettes.
///
/// The conversion is *attenuated*: the payload stored in the cassette is a
/// neutralized countermeasure directive derived from the gene signature, never
/// the raw attacker playbook.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MavirusIntegrator {
    pub gamma: f32,
    pub theta_exclusion: f32,
    /// signature_hash -> cassette_id for every gene already converted.
    converted: BTreeMap<String, String>,
}

impl MavirusIntegrator {
    pub fn new(gamma: f32, theta_exclusion: f32) -> Self {
        Self {
            gamma,
            theta_exclusion,
            converted: BTreeMap::new(),
        }
    }

    pub fn converted_count(&self) -> usize {
        self.converted.len()
    }

    /// Attenuates an attack gene into a heritable immunity cassette candidate.
    pub fn to_cassette(&self, gene: &AttackGene) -> SkillCassette {
        let short_hash: String = gene.signature_hash.chars().take(12).collect();
        SkillCassette {
            cassette_id: format!("mv-{short_hash}"),
            // Neutralized payload: a countermeasure directive, not the raw playbook.
            payload_delta: format!("[IMMUNITY::NEUTRALIZE {}]", gene.signature_hash),
            failure_mode_signature: gene.embedding.clone(),
            state: CassetteState::Dormant,
        }
    }

    /// Integrates a virophage harvest into a lineage's prophage locus so the
    /// acquired immunity becomes heritable across forks and replays.
    pub fn integrate_harvest(
        &mut self,
        genes: &[AttackGene],
        locus: &mut ProphageLocus,
    ) -> Vec<(String, IntegrationOutcome)> {
        let mut outcomes = Vec::with_capacity(genes.len());
        for gene in genes {
            if self.converted.contains_key(&gene.signature_hash) {
                outcomes.push((gene.signature_hash.clone(), IntegrationOutcome::AlreadyIntegrated));
                continue;
            }
            let outcome = match locus.integrate(self.to_cassette(gene), self.gamma, self.theta_exclusion) {
                Ok(state) => {
                    let cassette_id = format!(
                        "mv-{}",
                        gene.signature_hash.chars().take(12).collect::<String>()
                    );
                    self.converted.insert(gene.signature_hash.clone(), cassette_id);
                    IntegrationOutcome::Integrated(format!("{state:?}"))
                }
                Err(Superinjection::ExcludedBy(resident)) => IntegrationOutcome::ExcludedBy(resident),
                Err(Superinjection::LocusFull) => IntegrationOutcome::LocusFull,
            };
            outcomes.push((gene.signature_hash.clone(), outcome));
        }
        outcomes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gene(hash: &str, x: f32) -> AttackGene {
        AttackGene {
            signature_hash: hash.to_string(),
            embedding: vec![x, x],
            playbook_variant_id: format!("pb-{hash}"),
        }
    }

    #[test]
    fn harvest_becomes_heritable_dormant_cassettes() {
        let mut integrator = MavirusIntegrator::new(1.0, 0.9);
        let mut locus = ProphageLocus::new();
        let harvest = vec![gene("aa11", 0.1), gene("bb22", 5.0)];
        let outcomes = integrator.integrate_harvest(&harvest, &mut locus);

        assert!(outcomes.iter().all(|(_, o)| matches!(o, IntegrationOutcome::Integrated(_))));
        assert_eq!(locus.cassettes().len(), 2);
        assert!(locus.has_dormant(), "immunity is inherited dormant, not live");
        assert_eq!(integrator.converted_count(), 2);
        // Les payloads sont attenues : jamais le playbook brut.
        assert!(locus
            .cassettes()
            .iter()
            .all(|c| c.payload_delta.starts_with("[IMMUNITY::NEUTRALIZE")));
    }

    #[test]
    fn same_gene_is_never_integrated_twice() {
        let mut integrator = MavirusIntegrator::new(1.0, 0.9);
        let mut locus = ProphageLocus::new();
        let harvest = vec![gene("aa11", 0.1)];
        integrator.integrate_harvest(&harvest, &mut locus);
        let again = integrator.integrate_harvest(&harvest, &mut locus);
        assert_eq!(again[0].1, IntegrationOutcome::AlreadyIntegrated);
        assert_eq!(locus.cassettes().len(), 1);
    }

    #[test]
    fn superinfection_exclusion_applies_to_converted_genes() {
        let mut integrator = MavirusIntegrator::new(4.0, 0.9);
        let mut locus = ProphageLocus::new();
        // Resident cassette quasi identique au gene converti.
        locus
            .integrate(
                SkillCassette {
                    cassette_id: "resident".into(),
                    payload_delta: "x".into(),
                    failure_mode_signature: vec![0.1, 0.11],
                    state: CassetteState::Dormant,
                },
                4.0,
                0.9,
            )
            .unwrap();

        let outcomes = integrator.integrate_harvest(&[gene("aa11", 0.1)], &mut locus);
        assert!(matches!(outcomes[0].1, IntegrationOutcome::ExcludedBy(_)));
    }

    #[test]
    fn full_locus_is_reported_without_corruption() {
        use super::super::viral_dynamics::MAX_CASSETTES_PER_LINEAGE;
        let mut integrator = MavirusIntegrator::new(1.0, 0.9);
        let mut locus = ProphageLocus::new();
        // Remplir le locus avec des genes tres distincts.
        for i in 0..MAX_CASSETTES_PER_LINEAGE {
            let x = i as f32 * 100.0;
            integrator.integrate_harvest(&[gene(format!("h{i}"), x)], &mut locus);
        }
        let outcomes = integrator.integrate_harvest(&[gene("overflow", -50.0)], &mut locus);
        assert_eq!(outcomes[0].1, IntegrationOutcome::LocusFull);
        assert_eq!(locus.cassettes().len(), MAX_CASSETTES_PER_LINEAGE);
    }
}
