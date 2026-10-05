//! Mesures sourcées et modulation bornée de la politique.
use crate::director::{Decision, Director};
pub use crate::physical_learning::MissionPhysicsProfile;
use crate::physical_measurements::*;
use crate::physics::PhysicalState;
use crate::planner::{Goal, WorldState};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PhysicalTelemetry {
    pub workspace_files: Option<usize>,
    pub context_bytes: Option<usize>,
    pub declared_dependencies: Option<usize>,
    pub line_coverage: Option<f64>,
    pub git_dirty_files: Option<usize>,
    pub git_branches: Option<usize>,
    pub ci_budget_ratio: Option<f64>,
    pub workspace: WorkspaceMeasurements,
    pub context: Measurement<ContextUsage>,
    pub evidence_debt: Measurement<EvidenceDebt>,
}
impl PhysicalTelemetry {
    pub fn sample() -> Self {
        Self::sample_with_context(None)
    }
    pub fn sample_with_context(context: Option<&[f64]>) -> Self {
        let context = context
            .filter(|values| values.iter().all(|value| value.is_finite()))
            .and_then(|values| serde_json::to_vec(values).ok())
            .map(|bytes| {
                Measurement::measured(ContextUsage::from_payload(&bytes), "director features JSON")
            })
            .unwrap_or_default();
        Self::sample_at(&WorkspacePhysicsConfig::default(), context)
    }
    pub fn sample_at(config: &WorkspacePhysicsConfig, context: Measurement<ContextUsage>) -> Self {
        let inventory = crate::physical_workspace::inventory(config);
        let dependencies = crate::physical_dependencies::dependencies(config, &inventory);
        let coverage = crate::physical_coverage::coverage(config, &inventory);
        let (git_dirty_files, git_branches) = crate::physical_git::sample_git(config);
        Self::from_workspace(
            WorkspaceMeasurements {
                inventory,
                dependencies,
                coverage,
                git_dirty_files,
                git_branches,
            },
            context,
        )
    }
    pub fn from_workspace(
        workspace: WorkspaceMeasurements,
        context: Measurement<ContextUsage>,
    ) -> Self {
        Self {
            workspace_files: workspace.inventory.usable().map(|value| value.files.len()),
            context_bytes: context.usable().map(|value| value.bytes),
            declared_dependencies: workspace
                .dependencies
                .usable()
                .map(|value| value.declared_count()),
            line_coverage: workspace
                .coverage
                .usable()
                .and_then(|value| value.line_ratio()),
            git_dirty_files: workspace.git_dirty_files.usable().copied(),
            git_branches: workspace.git_branches.usable().copied(),
            ci_budget_ratio: ci_budget_ratio(),
            workspace,
            context,
            evidence_debt: Measurement::default(),
        }
    }
    pub fn apply(&self, state: &mut PhysicalState) {
        self.apply_with_scale(state, 1.0);
    }
    pub fn apply_with_scale(&self, state: &mut PhysicalState, scale: f64) {
        let mut profile = MissionPhysicsProfile::default();
        profile.friction_scale = if scale.is_finite() {
            scale.clamp(0.8, 1.2)
        } else {
            1.0
        };
        self.apply_profile(state, &profile);
    }
    pub fn apply_profile(&self, state: &mut PhysicalState, profile: &MissionPhysicsProfile) {
        let safe = profile
            .valid()
            .then_some(profile)
            .cloned()
            .unwrap_or_default();
        if let Some(files) = self.workspace_files {
            state.friction =
                unit(state.friction + (files as f64 / 5000.0).min(0.2) * safe.friction_scale);
        }
        if let Some(bytes) = self.context_bytes {
            state.friction =
                unit(state.friction + (bytes as f64 / safe.context_reference()).min(0.15));
        }
        self.apply_structure(state, &safe);
        self.apply_constraints(state);
        if let Some(coverage) = self
            .line_coverage
            .filter(|value| value.is_finite() && (0.0..=1.0).contains(value))
        {
            state.rupture_risk = unit(state.rupture_risk + (1.0 - coverage) * 0.1);
        }
        state.viscosity = unit(0.5 * (1.0 - state.energy) + 0.5 * state.entropy);
        state.elasticity = unit(1.0 - 0.5 * state.rupture_risk - 0.3 * state.entropy);
    }
    fn apply_structure(&self, state: &mut PhysicalState, profile: &MissionPhysicsProfile) {
        state.structural_gravity.clear();
        if let Some(graph) = self.workspace.dependencies.usable() {
            state.entropy = unit(
                state.entropy
                    + (graph.edge_count() as f64 / profile.dependency_reference()).min(0.15),
            );
            state.structural_gravity = graph.gravity();
        } else if let Some(deps) = self.declared_dependencies {
            state.entropy =
                unit(state.entropy + (deps as f64 / profile.dependency_reference()).min(0.15));
        }
        if let Some(dirty) = self.git_dirty_files {
            state.entropy = unit(state.entropy + (dirty as f64 / 100.0).min(0.2));
        }
        if let Some(branches) = self.git_branches {
            state.inertia = unit(state.inertia + (branches as f64 / 100.0).min(0.15));
        }
    }
    fn apply_constraints(&self, state: &mut PhysicalState) {
        if let Some(ratio) = self.ci_budget_ratio.filter(|ratio| ratio.is_finite()) {
            state.energy = state.energy.min(unit(ratio));
            state.pressure = state.pressure.max(1.0 - unit(ratio));
        }
        if let Some(pressure) = self.context.usable().and_then(ContextUsage::token_pressure) {
            state.pressure = state.pressure.max(pressure);
            state.friction = unit(state.friction + pressure * 0.15);
        }
        if let Some(debt) = self.evidence_debt.usable().filter(|debt| debt.required > 0) {
            state.evidence_debt = unit(debt.outstanding as f64 / debt.required as f64);
            state.rupture_risk = unit(state.rupture_risk + state.evidence_debt * 0.1);
        }
    }
}
pub struct PhysicalDecisionInputs<'a> {
    pub state: &'a WorldState,
    pub goal: &'a Goal,
    pub telemetry: &'a PhysicalTelemetry,
}
pub fn decide_measured(
    director: &Director,
    inputs: PhysicalDecisionInputs<'_>,
) -> (Decision, PhysicalState) {
    let profile = director
        .mission_physics
        .get(&inputs.goal.mission_key())
        .filter(|profile| profile.valid())
        .cloned()
        .unwrap_or_default();
    let mut physical = PhysicalState::derive(
        inputs.state,
        director.physical_memory.as_ref().map(|memory| &memory.0),
    );
    physical.energy = if inputs.state.budget.is_finite() {
        unit(inputs.state.budget / profile.budget_reference())
    } else {
        0.0
    };
    inputs.telemetry.apply_profile(&mut physical, &profile);
    let context = crate::physics::DecisionContext {
        state: inputs.state,
        goal: inputs.goal,
        phys: &physical,
        previous_strategy: director.physical_memory.as_ref().map(|memory| memory.1),
    };
    (director.decide_physical(&context), physical)
}
pub(crate) fn unit(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        1.0
    }
}
fn ci_budget_ratio() -> Option<f64> {
    let remaining = std::env::var("CI_BUDGET_REMAINING")
        .or_else(|_| std::env::var("GITHUB_RUN_ATTEMPT_REMAINING"))
        .ok()?
        .parse::<f64>()
        .ok()?;
    let total = std::env::var("CI_BUDGET_TOTAL")
        .or_else(|_| std::env::var("GITHUB_RUN_ATTEMPT_TOTAL"))
        .ok()?
        .parse::<f64>()
        .ok()?;
    (remaining.is_finite() && total.is_finite() && remaining >= 0.0 && total > 0.0)
        .then(|| (remaining / total).clamp(0.0, 1.0))
}

/// Compatibilite pour les appelants directs; tick utilise le cache du runtime.
pub fn decide(director: &Director, state: &WorldState, goal: &Goal) -> (Decision, PhysicalState) {
    let context = serde_json::to_vec(&(state, goal, &director.last_context))
        .ok()
        .map(|bytes| {
            Measurement::measured(ContextUsage::from_payload(&bytes), "decision input JSON")
        })
        .unwrap_or_default();
    let telemetry = PhysicalTelemetry::sample_at(&WorkspacePhysicsConfig::default(), context);
    decide_measured(
        director,
        PhysicalDecisionInputs {
            state,
            goal,
            telemetry: &telemetry,
        },
    )
}
