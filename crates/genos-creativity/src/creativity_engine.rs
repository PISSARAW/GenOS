//! Moteur de créativité biomimétique : DMN / Salience / Executive / Dopamine / Plasticité.
//!
//! Ce module couple les composantes cognitives **déjà présentes** dans l'orchestrateur
//! (exploration_weight, Learner contextuel, ATP, gates d'évidence) pour produire des
//! comportements émergents : hypothèses créatives, sélection par salience, RPE dopaminergique
//! et consolidation vers des politiques permanentes.

use crate::consolidation::ConsolidationTarget;
use crate::consolidation::CrossConsolidation;
use crate::dopamine::{CreativityOutcome, DopamineSignal, DopamineTarget};
use crate::dreaming::{DreamingPhase, RawHypothesis};
use crate::salience::{FocusedTask, SalienceGate};
use crate::types::{Concept, Goal, Metabolism, WorldState};
use genos_store::capsule::CreativeMemoryStore;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreativityConfig {
    pub enabled: bool,
    pub dream_budget_atp_per_tick: f64,
    pub max_dream_cycles: usize,
    pub atp_per_dream: f64,
    pub salience_threshold: f64,
    pub min_novelty: f64,
}

impl Default for CreativityConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            dream_budget_atp_per_tick: 5.0,
            max_dream_cycles: 5,
            atp_per_dream: 1.0,
            salience_threshold: 0.6,
            min_novelty: 0.3,
        }
    }
}

/// Métriques cumulées du moteur, exposées pour télémétrie.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CreativityMetrics {
    pub dreams_generated: u64,
    pub hypotheses_filtered: u64,
    pub focused_tasks_executed: u64,
    pub validated_hypotheses: u64,
    pub exploration_weight_delta: f64,
    pub novel_concepts_promoted: u64,
    pub unique_concepts_generated: u64,
    pub recombined_hypotheses: u64,
    pub prediction_error_sum: f64,
    pub prediction_observations: u64,
}

impl CreativityMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_dream(&mut self) {
        self.dreams_generated += 1;
    }

    pub fn record_generation(&mut self, hypotheses: &[RawHypothesis]) {
        let unique_concepts = hypotheses
            .iter()
            .map(|hypothesis| hypothesis.concept)
            .collect::<std::collections::HashSet<_>>()
            .len() as u64;
        self.record_dream();
        self.hypotheses_filtered += hypotheses.len() as u64;
        self.recombined_hypotheses += hypotheses
            .iter()
            .filter(|hypothesis| !hypothesis.source_fragments.is_empty())
            .count() as u64;
        self.unique_concepts_generated = self.unique_concepts_generated.max(unique_concepts);
    }

    pub fn record_prediction_error(&mut self, error: f64) {
        self.prediction_error_sum += error.abs();
        self.prediction_observations += 1;
    }

    pub fn mean_prediction_error(&self) -> f64 {
        if self.prediction_observations == 0 {
            0.0
        } else {
            self.prediction_error_sum / self.prediction_observations as f64
        }
    }

    pub fn record_filtered(&mut self, count: u64) {
        self.hypotheses_filtered += count;
    }

    pub fn record_executed(&mut self) {
        self.focused_tasks_executed += 1;
    }

    pub fn record_validated(&mut self) {
        self.validated_hypotheses += 1;
    }

    pub fn record_exploration_delta(&mut self, delta: f64) {
        self.exploration_weight_delta = (self.exploration_weight_delta + delta.abs()).min(1e9);
    }

    pub fn record_promotion(&mut self) {
        self.novel_concepts_promoted += 1;
    }
}

/// Moteur unifié appelé par l'orchestrateur aux bornes du tick.
#[derive(Clone, Debug)]
pub struct CreativityEngine {
    config: CreativityConfig,
    dreaming: DreamingPhase,
    salience: SalienceGate,
    dopamine: DopamineSignal,
    consolidation: CrossConsolidation,
    pending_focused: Vec<FocusedTask>,
    metrics: CreativityMetrics,
    /// Horloge de tick de l'orchestrateur (monotonique).
    tick_counter: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CreativeMemory {
    pub hypotheses: Vec<RawHypothesis>,
    pub tick_counter: u64,
    #[serde(default)]
    pub metrics: CreativityMetrics,
}

impl Default for CreativityEngine {
    fn default() -> Self {
        Self::new(CreativityConfig::default())
    }
}

impl CreativityEngine {
    pub fn new(config: CreativityConfig) -> Self {
        let salience = SalienceGate::new(config.salience_threshold, config.min_novelty);
        Self {
            config: config.clone(),
            dreaming: DreamingPhase::new(config),
            salience,
            dopamine: DopamineSignal::new(),
            consolidation: CrossConsolidation::new(),
            pending_focused: Vec::new(),
            metrics: CreativityMetrics::new(),
            tick_counter: 0,
        }
    }

    pub fn config(&self) -> &CreativityConfig {
        &self.config
    }

    pub fn metrics(&self) -> CreativityMetrics {
        self.metrics.clone()
    }

    pub fn export_memory(&self) -> CreativeMemory {
        CreativeMemory {
            hypotheses: self.dreaming.export_history(),
            tick_counter: self.tick_counter,
            metrics: self.metrics.clone(),
        }
    }

    pub fn import_memory(&mut self, memory: CreativeMemory) {
        self.dreaming
            .import_history(memory.hypotheses, memory.tick_counter);
        self.tick_counter = memory.tick_counter;
        self.metrics = memory.metrics;
        self.pending_focused.clear();
    }

    /// Persists exported hypotheses, tick position, and cumulative metrics.
    pub fn save_checkpoint(&self, store: &CreativeMemoryStore) -> std::io::Result<()> {
        let payload = serde_json::to_value(self.export_memory())
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
        store.save(&payload)
    }

    /// Restores durable memory; `false` means no checkpoint exists yet.
    pub fn restore_checkpoint(&mut self, store: &CreativeMemoryStore) -> std::io::Result<bool> {
        let Some(payload) = store.load()? else {
            return Ok(false);
        };
        let memory = serde_json::from_value(payload)
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))?;
        self.import_memory(memory);
        Ok(true)
    }

    /// Phase pré-tick : génère des hypothèses brutes, les filtre, retourne les tâches
    /// focalisées prêtes à être injectées dans le plan du Director.
    ///
    /// Consomme le budget ATP configuré si disponible.
    pub fn pre_tick(
        &mut self,
        world: &WorldState,
        goal: &Goal,
        metabolism: &mut Metabolism,
    ) -> Vec<FocusedTask> {
        if !self.config.enabled {
            return Vec::new();
        }
        if metabolism.available() < self.config.dream_budget_atp_per_tick {
            return Vec::new();
        }

        let budget = self
            .config
            .dream_budget_atp_per_tick
            .min(metabolism.available());
        let dream_budget = budget.min(self.config.dream_budget_atp_per_tick);
        if dream_budget <= 0.0 {
            return Vec::new();
        }

        // 1. Phase de rêve (DMN).
        let hypotheses = self.dreaming.dream(world, dream_budget, self.tick_counter);
        self.metrics.record_generation(&hypotheses);

        // 2. Consommation ATP de rêve (approximative : basée sur le nombre de cycles).
        let dream_cost = (hypotheses.len() as f64).mul_add(self.config.atp_per_dream, 0.0);
        let _ = metabolism.consume(dream_cost);

        // 3. Salience gate.
        let focused = self.salience.evaluate(&hypotheses, world, goal);
        self.metrics
            .record_filtered((hypotheses.len() - focused.len()) as u64);

        // 4. Queue pour exécution post-tick.
        self.pending_focused.extend(focused.clone());

        focused
    }

    /// Phase post-tick : applique RPE dopaminergique et consolidation aux concepts exécutés.
    ///
    /// `executed` est une slice de paires (concept exécuté, issue créative observée).
    /// Les tâches focalisées correspondantes sont nettoyées de la file.
    pub fn post_tick<D: DopamineTarget + ConsolidationTarget>(
        &mut self,
        director: &mut D,
        executed: &[(Concept, CreativityOutcome)],
    ) {
        if !self.config.enabled {
            return;
        }

        // Contexte actuel pour RPE (simplifié : pas de WorldState disponible ici).
        let ctx = self.dopamine.expected_reward_from_context(&[]);

        for (concept, outcome) in executed {
            // Recherche d'une hypothèse parente dans la file (v1 : correspondance par concept).
            let task = self
                .pending_focused
                .iter()
                .find(|t| t.concept == *concept)
                .cloned();

            let actual = self.dopamine.actual_reward(outcome);
            self.metrics
                .record_prediction_error(actual - task.as_ref().map(|t| t.priority).unwrap_or(0.0));

            let initial = director.exploration_weight();
            self.dopamine.apply(director, ctx, actual);
            let delta = (director.exploration_weight() - initial).abs();
            self.metrics.record_exploration_delta(delta);

            if matches!(outcome, CreativityOutcome::Validated { .. }) {
                self.metrics.record_validated();
            }

            if let Some(task) = task {
                self.consolidation
                    .consolidate(director, concept, &task, outcome);
            }
        }

        self.metrics.record_executed();

        // Nettoyage : on ne conserve que les tâches non exécutées.
        let executed_concepts: Vec<Concept> = executed.iter().map(|(c, _)| *c).collect();
        self.pending_focused
            .retain(|t| !executed_concepts.contains(&t.concept));
    }

    /// Incrémente le compteur de tick (à appeler depuis l'orchestrateur).
    pub fn tick(&mut self) {
        self.tick_counter += 1;
    }
}

/// Adaptateur pour le Director de genos-orchestrator.
///
/// Ce trait permet au CreativityEngine de fonctionner sans dépendance directe vers
/// genos-orchestrator. L'implémentation réelle est dans le module d'intégration
/// de l'orchestrateur.
pub trait DirectorAdapter: DopamineTarget + ConsolidationTarget {}

#[cfg(test)]
#[path = "creativity_engine_tests.rs"]
mod tests;
