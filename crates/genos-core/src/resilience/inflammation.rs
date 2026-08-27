//! Graduated inflammatory response.
//!
//! Unlike fever (systemic, thermal), inflammation is a *localized* graduated
//! response to tissue damage: vasodilation first (more resources routed to the
//! damaged region), then plasma leakage (context isolation around the wound),
//! and finally a chronic-risk state if the response never resolves.
//!
//! Reference design: `docs/research/fr/BIOMIMICRY_BLOOD_BRAIN_BARRIER.md`.

use serde::{Deserialize, Serialize};

/// Stages of the inflammatory cascade, strictly ordered by intensity.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum InflammationStage {
    /// No inflammation.
    Quiescent,
    /// Vasodilation: extra capacity routed to the wounded zone.
    Vasodilation,
    /// Plasma leakage + immune influx: the zone is isolated from healthy
    /// traffic (local quarantine analogue).
    Exudation,
    /// Response unresolved for too long: chronic inflammation damages the
    /// tissue itself and must be escalated (apoptosis/fibrosis decision).
    Chronic,
}

const VASODILATION_THRESHOLD: f32 = 0.25;
const EXUDATION_THRESHOLD: f32 = 0.60;
const CHRONIC_THRESHOLD: f32 = 0.85;

/// A localized inflammatory site.
#[derive(Clone, Debug)]
pub struct InflammatorySite {
    pub id: String,
    pub intensity: f32,
    /// Cycles spent above the exudation threshold without resolution.
    pub sustained_cycles: u32,
}

impl InflammatorySite {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            intensity: 0.0,
            sustained_cycles: 0,
        }
    }

    /// Adds damage to the site (bounded in [0, 1]).
    pub fn injure(&mut self, damage: f32) {
        self.intensity = (self.intensity + damage.clamp(0.0, 1.0)).min(1.0);
    }

    /// One healing cycle: intensity decays naturally, but sustained high
    /// inflammation accumulates chronicity instead.
    pub fn heal_cycle(&mut self, decay_rate: f32) -> InflammationStage {
        let stage_before = self.stage();
        if self.intensity > EXUDATION_THRESHOLD && stage_before >= InflammationStage::Exudation {
            // Non résolue : la chronicité progresse même si l'intensité décroît.
            self.sustained_cycles += 1;
        } else if self.intensity <= EXUDATION_THRESHOLD {
            self.sustained_cycles = 0;
        }
        self.intensity = (self.intensity - decay_rate.clamp(0.0, 1.0)).max(0.0);
        self.stage()
    }

    /// Current graduated stage from intensity (+ chronicity).
    pub fn stage(&self) -> InflammationStage {
        if self.is_chronic() {
            return InflammationStage::Chronic;
        }
        if self.intensity >= EXUDATION_THRESHOLD {
            InflammationStage::Exudation
        } else if self.intensity >= VASODILATION_THRESHOLD {
            InflammationStage::Vasodilation
        } else {
            InflammationStage::Quiescent
        }
    }

    /// Chronicity: sustained exudation for at least this many cycles.
    fn is_chronic(&self) -> bool {
        self.sustained_cycles >= CHRONIC_CYCLES || self.intensity >= CHRONIC_THRESHOLD
    }

    /// Extra capacity share allocated by vasodilation, in [0, 1].
    pub fn resource_boost(&self) -> f32 {
        match self.stage() {
            InflammationStage::Quiescent => 0.0,
            InflammationStage::Vasodilation => 0.2,
            InflammationStage::Exudation | InflammationStage::Chronic => 0.5,
        }
    }

    /// Should the wounded component be escalated to apoptosis?
    pub fn requires_escalation(&self) -> bool {
        self.stage() == InflammationStage::Chronic
    }
}

/// Cycles of unresolved exudation before the chronic state is declared.
pub const CHRONIC_CYCLES: u32 = 10;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stages_escalate_with_intensity() {
        let mut site = InflammatorySite::new("wound-1");
        assert_eq!(site.stage(), InflammationStage::Quiescent);

        site.injure(0.3);
        assert_eq!(site.stage(), InflammationStage::Vasodilation);
        assert!((site.resource_boost() - 0.2).abs() < 1e-6);

        site.injure(0.5);
        assert_eq!(site.stage(), InflammationStage::Exudation);
        assert!((site.resource_boost() - 0.5).abs() < 1e-6);
    }

    #[test]
    fn healing_decays_and_resets_sustained_counter() {
        let mut site = InflammatorySite::new("wound-2");
        site.injure(0.7); // exsudation sans atteindre le seuil chronique immédiat
        assert_eq!(site.stage(), InflammationStage::Exudation);
        // Guérison progressive : quelques cycles et le site se résout.
        for _ in 0..20 {
            site.heal_cycle(0.05);
        }
        assert_eq!(site.stage(), InflammationStage::Quiescent);
        assert_eq!(site.sustained_cycles, 0);
        assert!(!site.requires_escalation());
    }

    #[test]
    fn unresolved_exudation_becomes_chronic() {
        let mut site = InflammatorySite::new("wound-3");
        site.injure(0.8);
        // La blessure ne guérit pas (decay nul) : chronicité programmée.
        for _ in 0..CHRONIC_CYCLES {
            site.heal_cycle(0.0);
        }
        assert_eq!(site.stage(), InflammationStage::Chronic);
        assert!(
            site.requires_escalation(),
            "chronique => escalade apoptotique"
        );
    }

    #[test]
    fn extreme_damage_is_immediately_chronic_risk() {
        let mut site = InflammatorySite::new("wound-4");
        site.injure(1.0);
        assert!(site.requires_escalation());
    }

    #[test]
    fn intensity_is_bounded() {
        let mut site = InflammatorySite::new("wound-5");
        for _ in 0..50 {
            site.injure(1.0);
        }
        assert!((site.intensity - 1.0).abs() < 1e-6);
        // Le decay ne passe jamais sous zéro.
        for _ in 0..50 {
            site.heal_cycle(0.1);
        }
        assert!(site.intensity >= 0.0);
    }
}
