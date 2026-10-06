//! Acquisition bornée, contexte explicite et reçu explicable de décision.
use crate::director::{Decision, Director, Strategy};
use crate::physical_measurements::*;
use crate::physical_store::PhysicalProfileStore;
use crate::physical_telemetry::{decide_measured, PhysicalDecisionInputs, PhysicalTelemetry};
use crate::physics::{determine_regime, PhysicalState, Regime};
use crate::planner::{Concept, Goal, WorldState};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PhysicalDecisionReceipt {
    pub schema: String,
    pub maturity: String,
    pub mission: String,
    pub telemetry: PhysicalTelemetry,
    pub state: PhysicalState,
    pub regime: Regime,
    pub strategy: Strategy,
    pub rationale: String,
    pub calibrated_samples: u64,
    pub diagnostics: Vec<String>,
}
pub struct PhysicalRuntime {
    pub config: WorkspacePhysicsConfig,
    pub last_report: Option<PhysicalDecisionReceipt>,
    pub diagnostics: Vec<String>,
    pub(crate) store: Option<PhysicalProfileStore>,
    initialized_root: Option<std::path::PathBuf>,
    active_goal: Option<String>,
    cache: Option<(Instant, WorkspaceMeasurements)>,
    supplied_context: Option<Measurement<ContextUsage>>,
    supplied_debt: Measurement<EvidenceDebt>,
    pub(crate) actions: Vec<(Concept, f64, f64)>,
    pub(crate) episode_start: Option<Instant>,
    pub(crate) episode_context: Option<usize>,
    pub(crate) episode_dependencies: Option<usize>,
}
impl Default for PhysicalRuntime {
    fn default() -> Self {
        Self {
            config: WorkspacePhysicsConfig::default(),
            last_report: None,
            diagnostics: Vec::new(),
            store: None,
            initialized_root: None,
            active_goal: None,
            cache: None,
            supplied_context: None,
            supplied_debt: Measurement::default(),
            actions: Vec::new(),
            episode_start: None,
            episode_context: None,
            episode_dependencies: None,
        }
    }
}
impl PhysicalRuntime {
    pub fn invalidate_workspace(&mut self) {
        self.cache = None;
    }
    /// Le contexte fourni vaut pour la prochaine décision; il doit être renouvelé.
    pub fn set_context_usage(&mut self, usage: ContextUsage, source: &str) -> Result<(), String> {
        if source.trim().is_empty() || usage.capacity_tokens == Some(0) {
            return Err("source ou capacite de contexte invalide".into());
        }
        self.supplied_context = Some(Measurement::measured(usage, source));
        Ok(())
    }
    pub fn set_evidence_debt(&mut self, debt: EvidenceDebt, source: &str) -> Result<(), String> {
        if source.trim().is_empty() || debt.outstanding > debt.required {
            return Err("dette de preuve invalide".into());
        }
        self.supplied_debt = Measurement::measured(debt, source);
        Ok(())
    }
    pub fn decide(
        &mut self,
        director: &mut Director,
        input: (&WorldState, &Goal),
    ) -> (Decision, PhysicalState) {
        self.initialize(director);
        let mission = input.1.mission_key();
        if self.active_goal.as_ref() != Some(&mission) {
            director.physical_memory = None;
        }
        self.active_goal = Some(mission);
        let context = self
            .supplied_context
            .take()
            .unwrap_or_else(|| decision_context(director, input));
        let mut telemetry = self.telemetry(context);
        telemetry.evidence_debt = std::mem::take(&mut self.supplied_debt);
        self.observe_dimensions(&telemetry);
        let (decision, state) = decide_measured(
            director,
            PhysicalDecisionInputs {
                state: input.0,
                goal: input.1,
                telemetry: &telemetry,
            },
        );
        self.last_report = Some(PhysicalDecisionReceipt {
            schema: "genos.physical-decision/v2".into(),
            maturity: "heuristic".into(),
            mission: input.1.mission_key(),
            telemetry,
            regime: determine_regime(input.0, &state),
            state: state.clone(),
            strategy: decision.strategy,
            rationale: decision.rationale.clone(),
            calibrated_samples: director
                .mission_physics
                .get(&input.1.mission_key())
                .map_or(0, |p| p.consumed_atp.count),
            diagnostics: self.diagnostics.clone(),
        });
        (decision, state)
    }
    fn initialize(&mut self, director: &mut Director) {
        let root = self
            .config
            .root
            .canonicalize()
            .unwrap_or_else(|_| self.config.root.clone());
        if self.initialized_root.as_ref() == Some(&root) {
            return;
        }
        if self.initialized_root.is_some() {
            director.mission_physics.clear();
        }
        director.physical_memory = None;
        self.cache = None;
        self.store = None;
        self.diagnostics.clear();
        self.initialized_root = Some(root);
        match PhysicalProfileStore::open(&self.config) {
            Ok(mut store) => {
                director.mission_physics.extend(store.load());
                self.diagnostics.extend(store.diagnostics.clone());
                self.store = Some(store);
            }
            Err(error) => self
                .diagnostics
                .push(format!("persistance indisponible: {error}")),
        }
    }
    fn telemetry(&mut self, context: Measurement<ContextUsage>) -> PhysicalTelemetry {
        let valid = self
            .cache
            .as_ref()
            .is_some_and(|(time, _)| time.elapsed() < self.config.cache_ttl);
        if !valid {
            let measured = PhysicalTelemetry::sample_at(&self.config, Measurement::default());
            self.cache = Some((Instant::now(), measured.workspace));
        }
        let workspace = self.cache.as_ref().expect("cache initialise").1.clone();
        PhysicalTelemetry::from_workspace(workspace, context)
    }
    fn observe_dimensions(&mut self, telemetry: &PhysicalTelemetry) {
        if let Some(context) = telemetry.context.usable() {
            self.episode_context = Some(self.episode_context.unwrap_or(0).max(context.bytes));
        }
        if telemetry.workspace.dependencies.status == MeasurementStatus::Measured {
            self.episode_dependencies = telemetry
                .workspace
                .dependencies
                .usable()
                .map(|graph| graph.edge_count());
        }
    }
    pub fn begin_episode(&mut self) {
        self.actions.clear();
        self.episode_context = None;
        self.episode_dependencies = None;
        self.episode_start = Some(Instant::now());
    }
    pub fn record_action(&mut self, concept: Concept, elapsed: Duration) {
        if self.episode_start.is_some() {
            self.actions
                .push((concept, concept.cost(), elapsed.as_secs_f64() * 1000.0));
        }
    }
}
fn decision_context(director: &Director, input: (&WorldState, &Goal)) -> Measurement<ContextUsage> {
    match serde_json::to_vec(&(input.0, input.1, &director.last_context)) {
        Ok(payload) => Measurement::measured(
            ContextUsage::from_payload(&payload),
            "decision input JSON: world, goal, director features",
        ),
        Err(error) => {
            let mut measurement =
                Measurement::unavailable("decision input JSON", MeasurementStatus::Invalid);
            measurement.detail = Some(error.to_string());
            measurement
        }
    }
}
