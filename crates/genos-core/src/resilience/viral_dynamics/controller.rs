//! Activation controller mapping live runtime signals onto viral mechanisms.

use super::cassette::{CassetteState, ProphageLocus};
use super::{ViralDynamicsEngine, DEFAULT_BURST_CLONES};
use serde::{Deserialize, Serialize};

/// Action selected by [`ViralResponseController`] from live runtime signals.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum ViralAction {
    /// Stress below induction threshold: continue nominal inference.
    Nominal { stress: f32 },
    /// Cheap path: express dormant cassettes instead of paying for clones.
    InduceCassettes {
        stress: f32,
        cassette_ids: Vec<String>,
    },
    /// Expensive path: spawn a mutant cloud around the stalled lineage.
    LyticBurst {
        stress: f32,
        recommended_clones: u32,
    },
}

/// Engine bundling the stress metric with the viral thresholds.
///
/// Decision order encodes the cost hierarchy documented in
/// `viral_dynamics.md`: nominal inference > cassette induction > lytic burst.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ViralResponseController {
    pub engine: ViralDynamicsEngine,
}

impl ViralResponseController {
    /// Decides what should happen for an agent reporting `consecutive_failures`
    /// and normalized `progress`.
    pub fn evaluate(
        &self,
        consecutive_failures: u32,
        progress: f32,
        locus: &ProphageLocus,
    ) -> ViralAction {
        let stress = self.engine.compute_stress(consecutive_failures, progress);
        if stress < self.engine.induction_threshold {
            return ViralAction::Nominal { stress };
        }
        let dormant: Vec<String> = locus
            .cassettes()
            .iter()
            .filter(|c| c.state == CassetteState::Dormant)
            .map(|c| c.cassette_id.clone())
            .collect();
        if !dormant.is_empty() && stress < self.engine.burst_threshold {
            return ViralAction::InduceCassettes {
                stress,
                cassette_ids: dormant,
            };
        }
        // No heritable answer to this failure class: pay for exploration.
        ViralAction::LyticBurst {
            stress,
            recommended_clones: DEFAULT_BURST_CLONES,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::cassette::{CassetteState, SkillCassette};
    use super::*;

    fn cassette(id: &str, signature: Vec<f32>) -> SkillCassette {
        SkillCassette {
            cassette_id: id.to_string(),
            payload_delta: format!("payload-{id}"),
            failure_mode_signature: signature,
            state: CassetteState::Dormant,
        }
    }

    #[test]
    fn controller_prefers_cheap_induction_then_burst() {
        let controller = ViralResponseController::default();

        let calm = ProphageLocus::new();
        assert!(matches!(
            controller.evaluate(0, 1.0, &calm),
            ViralAction::Nominal { .. }
        ));

        let mut stocked = ProphageLocus::new();
        stocked
            .integrate(cassette("skill", vec![0.0]), 1.0, 0.9)
            .unwrap();
        assert!(matches!(
            controller.evaluate(2, 0.6, &stocked),
            ViralAction::InduceCassettes { cassette_ids, .. } if cassette_ids == vec!["skill".to_string()]
        ));

        // Extreme stress escalates to a burst even with cassettes available.
        assert!(matches!(
            controller.evaluate(30, 0.0, &stocked),
            ViralAction::LyticBurst { recommended_clones, .. } if recommended_clones == DEFAULT_BURST_CLONES
        ));
    }
}
