//! Computational fever and thermoregulation.
//!
//! Fever is an active immune defense: endogenous pyrogens (DAMP signals,
//! confirmed threats) raise the thermal set-point, and the runtime follows by
//! elevating its sampling temperature — trading precision for exploration
//! while the "infection" lasts. When the threat clears, the set-point returns
//! to baseline and the system cools down.
//!
//! This complements somatic hypermutation (`hypermutation.md`): hypermutation
//! is a localized mutational burst, fever is the systemic thermal response.

use super::ais::DamSignal;
use serde::{Deserialize, Serialize};

/// Baseline inference temperature (normothermia).
pub const BASELINE_TEMPERATURE: f32 = 0.7;
/// Maximum tolerated fever (hyperpyrexia cap).
pub const MAX_TEMPERATURE: f32 = 1.25;

/// Endogenous or exogenous pyrogens raising the thermal set-point.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Pyrogen {
    /// Confirmed antigen in the environment (PAMP analogue).
    ConfirmedThreat { signature: String },
    /// Internal damage signals (DAMP analogue).
    EndogenousDamage { level: f32 },
}

/// A thermoregulating runtime.
#[derive(Clone, Debug)]
pub struct Thermoregulator {
    /// Current effective sampling temperature.
    pub current: f32,
    /// Regulated set-point (the "hypothalamic target").
    pub setpoint: f32,
    /// Fraction of the gap closed per cycle.
    pub responsiveness: f32,
    active_pyrogens: Vec<Pyrogen>,
}

impl Default for Thermoregulator {
    fn default() -> Self {
        Self::new()
    }
}

impl Thermoregulator {
    pub fn new() -> Self {
        Self {
            current: BASELINE_TEMPERATURE,
            setpoint: BASELINE_TEMPERATURE,
            responsiveness: 0.2,
            active_pyrogens: Vec::new(),
        }
    }

    /// Declares a pyrogen; the hypothalamic set-point rises accordingly
    /// (capped at [`MAX_TEMPERATURE`]).
    pub fn expose_to(&mut self, pyrogen: Pyrogen) {
        if !self.active_pyrogens.contains(&pyrogen) {
            self.active_pyrogens.push(pyrogen);
        }
        self.recompute_setpoint();
    }

    /// Clears a confirmed threat: its pyrogenic effect is withdrawn.
    pub fn clear_threat(&mut self, signature: &str) {
        self.active_pyrogens
            .retain(|p| !matches!(p, Pyrogen::ConfirmedThreat { signature: s } if s == signature));
        self.recompute_setpoint();
    }

    fn recompute_setpoint(&mut self) {
        let mut rise = 0.0_f32;
        for pyrogen in &self.active_pyrogens {
            rise += match pyrogen {
                Pyrogen::ConfirmedThreat { .. } => 0.25,
                Pyrogen::EndogenousDamage { level } => 0.25 * level.clamp(0.0, 1.0),
            };
        }
        self.setpoint = (BASELINE_TEMPERATURE + rise).min(MAX_TEMPERATURE);
    }

    /// One homeostatic step: the current temperature relaxes toward the
    /// set-point (heating during fever onset, cooling during defervescence).
    pub fn regulate(&mut self) -> f32 {
        let gap = self.setpoint - self.current;
        self.current += gap * self.responsiveness.clamp(0.01, 1.0);
        self.current = self.current.clamp(0.0, MAX_TEMPERATURE);
        self.current
    }

    /// Is the system febrile (set-point above baseline)?
    pub fn febrile(&self) -> bool {
        self.setpoint > BASELINE_TEMPERATURE + f32::EPSILON
    }

    /// Number of pyrogens still driving the fever.
    pub fn pyrogen_count(&self) -> usize {
        self.active_pyrogens.len()
    }

    /// Convenience mapping from AIS danger telemetry to an internal pyrogen.
    pub fn expose_to_damage_signals(&mut self, signals: &[DamSignal]) {
        let level = crate::resilience::ais::DangerModel::new(0.5).damp_level(signals);
        if level > 0.0 {
            // Ré-amplification : un DAMP moyen doit quand même élever la fièvre.
            self.expose_to(Pyrogen::EndogenousDamage { level: level * 4.0 });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threats_raise_setpoint_and_system_follows() {
        let mut t = Thermoregulator::new();
        assert!(!t.febrile());
        t.expose_to(Pyrogen::ConfirmedThreat {
            signature: "sql-injection".into(),
        });
        assert!(t.febrile());
        assert!((t.setpoint - (BASELINE_TEMPERATURE + 0.25)).abs() < 1e-6);

        // Le courant converge progressivement vers le set-point sans le dépasser.
        for _ in 0..50 {
            t.regulate();
        }
        assert!((t.current - t.setpoint).abs() < 1e-4);
        assert!(t.current <= MAX_TEMPERATURE);
    }

    #[test]
    fn clearing_the_threat_cools_the_system_back_to_baseline() {
        let mut t = Thermoregulator::new();
        t.expose_to(Pyrogen::ConfirmedThreat { signature: "sig-1".into() });
        for _ in 0..30 {
            t.regulate();
        }
        assert!(t.febrile());

        t.clear_threat("sig-1");
        assert_eq!(t.pyrogen_count(), 0);
        assert!(!t.febrile());
        for _ in 0..60 {
            t.regulate();
        }
        assert!(
            (t.current - BASELINE_TEMPERATURE).abs() < 1e-3,
            "retour à la normothermie, obtenu {}",
            t.current
        );
    }

    #[test]
    fn multiple_pyrogens_stack_but_respect_hyperpyrexia_cap() {
        let mut t = Thermoregulator::new();
        for i in 0..10 {
            t.expose_to(Pyrogen::ConfirmedThreat { signature: format!("s{i}") });
        }
        assert!((t.setpoint - MAX_TEMPERATURE).abs() < 1e-6, "plafond respecté");
    }

    #[test]
    fn damage_signals_translate_into_endogenous_pyrogens() {
        use crate::resilience::ais::DamSignal;
        let mut t = Thermoregulator::new();
        t.expose_to_damage_signals(&[DamSignal::InvariantBreach]);
        assert!(t.pyrogen_count() >= 1);
        assert!(t.febrile());

        // Des signaux nuls ne déclenchent rien.
        let mut calm = Thermoregulator::new();
        calm.expose_to_damage_signals(&[]);
        assert_eq!(calm.pyrogen_count(), 0);
    }
}
