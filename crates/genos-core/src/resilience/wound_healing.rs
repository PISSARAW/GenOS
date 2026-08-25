//! Wound healing: ordered recovery after a component injury.
//!
//! Complements `StemCellRegenerator` (which re-spawns a service) by tracking
//! the *quality* of the repair over time. Like tissue, a regenerated
//! component passes through four phases — hemostasis (stabilization),
//! inflammation (cleanup), proliferation (capacity regrowth), remodeling
//! (scar maturation) — and only recovers full strength at the end.

use serde::{Deserialize, Serialize};

/// Ordered healing phases.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum HealingPhase {
    /// Emergency stabilization: component restarted but degraded.
    Hemostasis,
    /// Debris cleanup: autophagy/DLQ drain the corrupted backlog.
    Inflammation,
    /// Capacity regrowth: the component serves again, below nominal.
    Proliferation,
    /// Scar maturation: performance converges back to nominal.
    Remodeling,
}

/// Default cycles spent in each phase.
pub const PHASE_DURATIONS: [u32; 4] = [2, 4, 8, 6];

/// Tracks one wound from injury to full recovery.
#[derive(Clone, Debug)]
pub struct Wound {
    pub id: String,
    phase: HealingPhase,
    cycles_in_phase: u32,
    total_cycles: u32,
}

impl Wound {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            phase: HealingPhase::Hemostasis,
            cycles_in_phase: 0,
            total_cycles: 0,
        }
    }

    pub fn phase(&self) -> HealingPhase {
        self.phase
    }

    fn phase_index(&self) -> usize {
        match self.phase {
            HealingPhase::Hemostasis => 0,
            HealingPhase::Inflammation => 1,
            HealingPhase::Proliferation => 2,
            HealingPhase::Remodeling => 3,
        }
    }

    /// Fraction of nominal capacity currently available, in `[0, 1]`.
    /// Grows across phases; a fresh scar starts weak and matures.
    pub fn strength(&self) -> f32 {
        let base = match self.phase {
            HealingPhase::Hemostasis => 0.10,
            HealingPhase::Inflammation => 0.25,
            HealingPhase::Proliferation => 0.60,
            HealingPhase::Remodeling => 0.80,
        };
        // Progression linéaire à l'intérieur de la phase courante.
        let duration = PHASE_DURATIONS[self.phase_index()] as f32;
        let progress = (self.cycles_in_phase as f32 / duration).clamp(0.0, 1.0);
        match self.phase {
            HealingPhase::Remodeling => base + progress * 0.20,
            _ => base + progress * 0.15,
        }
    }

    /// Fully healed?
    pub fn healed(&self) -> bool {
        self.phase == HealingPhase::Remodeling && self.cycles_in_phase >= PHASE_DURATIONS[3]
    }

    /// Advances healing by one cycle.
    pub fn heal_cycle(&mut self) -> HealingPhase {
        if self.healed() {
            return self.phase;
        }
        // La transition a lieu à l'entrée du cycle qui suit la fin de phase :
        // chaque phase dure exactement `PHASE_DURATIONS[i]` cycles complets,
        // et le cycle de transition n'est pas compté dans la nouvelle phase.
        let duration = PHASE_DURATIONS[self.phase_index()];
        if self.cycles_in_phase >= duration {
            let next_index = (self.phase_index() + 1).min(3);
            self.phase = match next_index {
                0 => HealingPhase::Hemostasis,
                1 => HealingPhase::Inflammation,
                2 => HealingPhase::Proliferation,
                _ => HealingPhase::Remodeling,
            };
            self.cycles_in_phase = 0;
            self.total_cycles += 1;
            return self.phase;
        }
        self.cycles_in_phase += 1;
        self.total_cycles += 1;
        self.phase
    }

    /// Total cycles elapsed since the injury.
    pub fn elapsed_cycles(&self) -> u32 {
        self.total_cycles
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phases_progress_in_order_until_healed() {
        let mut wound = Wound::new("svc-a");
        assert_eq!(wound.phase(), HealingPhase::Hemostasis);

        let expected_order = [
            (HealingPhase::Hemostasis, PHASE_DURATIONS[0], HealingPhase::Inflammation),
            (HealingPhase::Inflammation, PHASE_DURATIONS[1], HealingPhase::Proliferation),
            (HealingPhase::Proliferation, PHASE_DURATIONS[2], HealingPhase::Remodeling),
            (HealingPhase::Remodeling, PHASE_DURATIONS[3], HealingPhase::Remodeling),
        ];
        for (phase, duration, next) in expected_order {
            for _ in 0..duration {
                assert_eq!(wound.heal_cycle(), phase);
            }
            assert_eq!(wound.heal_cycle(), next, "transition après la durée de phase");
        }
        // Cicatrice mûre : force nominale.
        assert!(wound.healed());
        assert!((wound.strength() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn strength_grows_monotonically_from_very_weak_to_nominal() {
        let mut wound = Wound::new("svc-b");
        let mut previous = wound.strength();
        assert!(previous < 0.25, "une plaie fraîche est très affaiblie");
        for _ in 0..30 {
            wound.heal_cycle();
            let current = wound.strength();
            assert!(current >= previous - 1e-6, "la force ne doit pas régresser");
            previous = current;
        }
        assert!(previous > 0.95);
    }

    #[test]
    fn healed_wound_is_idempotent() {
        let mut wound = Wound::new("svc-c");
        for _ in 0..40 {
            wound.heal_cycle();
        }
        let total = wound.elapsed_cycles();
        assert!(wound.healed());
        for _ in 0..10 {
            wound.heal_cycle();
        }
        assert_eq!(wound.elapsed_cycles(), total, "plus de progression après guérison");
    }
}
