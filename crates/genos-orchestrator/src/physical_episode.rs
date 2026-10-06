use crate::director::Decision;
use crate::physical_learning::EpisodeObservation;
use crate::physics::PhysicalState;
use crate::planner::{Goal, WorldState};
use crate::GenosEcosystem;
use serde_json::json;

impl GenosEcosystem {
    pub(crate) fn decide_with_physics(
        &mut self,
        state: &WorldState,
        goal: &Goal,
    ) -> (Decision, PhysicalState) {
        let result = self.physics.decide(&mut self.director, (state, goal));
        if let Some(receipt) = &self.physics.last_report {
            let payload = serde_json::to_value(receipt)
                .unwrap_or_else(|error| json!({"error": error.to_string()}));
            self.record_event("PHYSICAL_DECISION", payload);
        }
        result
    }
    pub(crate) fn attempt_physical_reproduction(&mut self) {
        if self
            .physics
            .last_report
            .as_ref()
            .is_some_and(|report| report.regime == crate::physics::Regime::Normal)
        {
            let _ = self.attempt_autonomous_reproduction_if_alive();
        }
    }
    pub(crate) fn finish_physics_episode(&mut self, goal: &Goal, success: bool) {
        let Some(started) = self.physics.episode_start.take() else {
            return;
        };
        let observation = EpisodeObservation {
            success,
            consumed_atp: self.physics.actions.iter().map(|action| action.1).sum(),
            elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
            context_bytes: self.physics.episode_context,
            dependency_edges: self.physics.episode_dependencies,
            actions: std::mem::take(&mut self.physics.actions),
        };
        if observation.consumed_atp <= 0.0 {
            return;
        }
        let key = goal.mission_key();
        let profile = self
            .director
            .mission_physics
            .entry(key.clone())
            .or_default();
        profile.observe(&observation);
        let persisted = match self.physics.store.as_mut() {
            Some(store) => store.save(&key, profile),
            None => Err("stockage physique indisponible".into()),
        };
        if let Err(error) = &persisted {
            self.physics.diagnostics.push(error.clone());
        }
        self.record_event(
            "PHYSICAL_CALIBRATION",
            json!({
                "schema": "genos.physical-calibration/v2", "mission": key,
                "success_observed": success, "consumed_atp": observation.consumed_atp,
                "elapsed_ms": observation.elapsed_ms, "persisted": persisted.is_ok(),
                "error": persisted.err(),
            }),
        );
    }
}
