//! Necrosis: uncontrolled, chaotic cell death.
//!
//! GenOS models necrosis as the *anti-pattern* of apoptosis: when a component
//! dies outside the caspase cascade (hard panic, forced kill, corrupted state
//! preventing clean teardown), its contents spill onto neighbours — the
//! analogue of toxin release by a bursting membrane — and can trigger
//! cascading failures.
//!
//! The module exists to *measure* necrotic events so resilience policy can
//! prefer ordered apoptosis wherever possible.

use serde::{Deserialize, Serialize};

/// How a component died.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum DeathMode {
    /// Ordered death through the caspase pipeline: no spillover.
    Apoptotic,
    /// Uncontrolled death: contents leak to neighbours.
    Necrotic { cause: NecrosisCause },
}

/// Causes of necrotic death.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum NecrosisCause {
    /// Unrecoverable panic bypassing the apoptosis receiver.
    HardPanic,
    /// Forced external kill while locks were held.
    ForcedTermination,
    /// State too corrupted for the clean-shutdown path to run.
    CorruptTeardown,
}

/// One necrotic event and its measured blast radius.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NecroticEvent {
    pub component_id: String,
    pub cause: NecrosisCause,
    /// Neighbours damaged by content spillover.
    pub affected_neighbours: Vec<String>,
}

impl NecroticEvent {
    /// Blast radius = number of neighbours contaminated by the spill.
    pub fn blast_radius(&self) -> usize {
        self.affected_neighbours.len()
    }
}

/// Registry of necrotic events in the system.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct NecrosisLedger {
    events: Vec<NecroticEvent>,
}

impl NecrosisLedger {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a death. Apoptotic deaths are logged as healthy statistics;
    /// only necrotic ones enter the ledger as incidents.
    pub fn record(&mut self, mode: &DeathMode, component_id: &str, neighbours: &[String]) {
        if let DeathMode::Necrotic { cause } = mode {
            // Le spillover touche tous les voisins : c'est la définition même
            // de la lyse non contrôlée.
            self.events.push(NecroticEvent {
                component_id: component_id.to_string(),
                cause: cause.clone(),
                affected_neighbours: neighbours.to_vec(),
            });
        }
    }

    pub fn events(&self) -> &[NecroticEvent] {
        &self.events
    }

    /// Total contamination across all necrotic events.
    pub fn total_blast_radius(&self) -> usize {
        self.events.iter().map(|e| e.blast_radius()).sum()
    }

    /// Fraction of recent deaths that were orderly, in [0, 1].
    /// A healthy system trends toward 1.0; below 0.5 the runtime should
    /// invest in better apoptosis coverage (catch_unwind, lock audits...).
    pub fn orderly_death_ratio(&self, apoptotic_deaths: u32) -> f32 {
        let total = apoptotic_deaths as usize + self.events.len();
        if total == 0 {
            return 1.0;
        }
        apoptotic_deaths as f32 / total as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_necrotic_deaths_enter_the_ledger() {
        let mut ledger = NecrosisLedger::new();
        ledger.record(
            &DeathMode::Apoptotic,
            "clean-agent",
            &["neighbour".to_string()],
        );
        assert!(ledger.events().is_empty(), "l'apoptose ne contamine personne");
        assert_eq!(ledger.total_blast_radius(), 0);
        assert_eq!(ledger.orderly_death_ratio(1), 1.0);

        ledger.record(
            &DeathMode::Necrotic { cause: NecrosisCause::HardPanic },
            "dirty-agent",
            &["n1".to_string(), "n2".to_string()],
        );
        assert_eq!(ledger.events().len(), 1);
        assert_eq!(ledger.total_blast_radius(), 2);
    }

    #[test]
    fn blast_radius_counts_each_contaminated_neighbour() {
        let event = NecroticEvent {
            component_id: "x".into(),
            cause: NecrosisCause::ForcedTermination,
            affected_neighbours: vec!["a".into(), "b".into(), "c".into()],
        };
        assert_eq!(event.blast_radius(), 3);
    }

    #[test]
    fn ratio_flags_systems_with_too_much_chaotic_death() {
        let mut ledger = NecrosisLedger::new();
        for i in 0..3 {
            ledger.record(
                &DeathMode::Necrotic { cause: NecrosisCause::CorruptTeardown },
                &format!("bad-{i}"),
                &[],
            );
        }
        // 3 nécroses contre 2 apoptoses : le système est malsain.
        assert!(ledger.orderly_death_ratio(2) < 0.5);
        // Avec 10 apoptoses pour les mêmes 3 nécroses, la santé remonte.
        assert!(ledger.orderly_death_ratio(10) > 0.5);
        // Aucune mort du tout : ratio parfait.
        assert_eq!(NecrosisLedger::new().orderly_death_ratio(0), 1.0);
    }
}
