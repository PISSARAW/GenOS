//! Phase de rêve (DMN analogue) : génération libre d'hypothèses brutes sans gate d'évidence.
//!
//! Cette phase explore l'espace des concepts applicables avec un biais d'exploration
//! (pas greedy), génère un payload brut et estime la nouveauté. Les hypothèses sont
//! stockées dans l'historique du moteur pour consolidation ultérieure.

use crate::types::{Concept, WorldState};
use crate::creativity_engine::CreativityConfig;
use rand::RngExt;
use rand::SeedableRng;
use rand::prelude::IndexedRandom;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Hypothèse brute non évaluée (sortie DMN / phase de rêve).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RawHypothesis {
    pub id: Uuid,
    pub concept: Concept,
    pub payload: serde_json::Value,
    pub novelty_score: f64,
    pub energy_cost_estimate: f64,
    pub parent_hypotheses: Vec<Uuid>,
    /// Fragments réellement utilisés pour construire l'idée (mémoire -> recombinaison).
    pub source_fragments: Vec<serde_json::Value>,
    /// Résultat de la simulation interne avant toute exécution réelle.
    pub simulation: SimulationTrace,
    pub generated_at_tick: u64,
}

/// Trace falsifiable de la simulation mentale d'une hypothèse.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SimulationTrace {
    pub predicted_effects: Vec<String>,
    pub constraints: Vec<String>,
    pub feasibility: f64,
}

/// Phase de rêve : exploration non contrainte.
pub struct DreamingPhase {
    config: CreativityConfig,
    history: Vec<RawHypothesis>,
    tick_counter: u64,
    rng: rand::rngs::StdRng,
}

impl DreamingPhase {
    pub fn new(config: CreativityConfig) -> Self {
        let mut seed = [0u8; 32];
        seed.fill_with(rand::random);
        let rng = rand::rngs::StdRng::from_seed(seed);
        Self {
            config,
            history: Vec::new(),
            tick_counter: 0,
            rng,
        }
    }

    pub fn tick(&mut self) {
        self.tick_counter += 1;
    }

    /// Génère des hypothèses brutes depuis le DMN, avec budget ATP borné.
    ///
    /// Retourne les hypothèses générées lors de ce cycle.
    pub fn dream(
        &mut self,
        world: &WorldState,
        budget_atp: f64,
        orchestrator_tick: u64,
    ) -> Vec<RawHypothesis> {
        let max_cycles = {
            let by_budget = (budget_atp / self.config.atp_per_dream).floor() as usize;
            self.config.max_dream_cycles.min(by_budget).max(0)
        };

        let mut hypotheses = Vec::with_capacity(max_cycles);

        for _ in 0..max_cycles {
            let concept = self.sample_concept_exploratory(world);
            if !world.applicable(concept) {
                continue;
            }
            let novelty = self.novelty_score(&concept);
            let cost = concept.cost() as f64 * self.config.atp_per_dream;
            if budget_atp < cost {
                break;
            }
            let parent_hypotheses = self.select_parents();
            let source_fragments = self.parent_fragments(&parent_hypotheses);
            let payload = self.generate_raw_payload(&concept, world, &source_fragments);
            let simulation = self.simulate(&concept, world, &source_fragments);

            let hyp = RawHypothesis {
                id: Uuid::new_v4(),
                concept,
                payload,
                novelty_score: novelty,
                energy_cost_estimate: cost,
                parent_hypotheses,
                source_fragments,
                simulation,
                generated_at_tick: orchestrator_tick,
            };
            hypotheses.push(hyp);
        }

        self.history.extend(hypotheses.clone());
        self.tick();
        hypotheses
    }

    /// Sélection de concept par approche exploratoire (biais nouveauté + aléatoire).
    fn sample_concept_exploratory(&mut self, world: &WorldState) -> Concept {
        let applicable: Vec<Concept> = Concept::all()
            .into_iter()
            .filter(|c| world.applicable(*c))
            .collect();

        if applicable.is_empty() {
            return Concept::Observe;
        }

        // Avec probabilité d'exploration, on choisit au hasard ; sinon on choisit le
        // meilleur selon novelty_score (heuristique).
        let explore = self.rng.random::<f64>() < 0.4;
        if explore {
            applicable
                .choose(&mut self.rng)
                .copied()
                .unwrap_or(Concept::Observe)
        } else {
            applicable
                .iter()
                .max_by(|a, b| {
                    self.novelty_score(a)
                        .partial_cmp(&self.novelty_score(b))
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .copied()
                .unwrap_or(Concept::Observe)
        }
    }

    /// Score de nouveauté heuristique (v1 : basé sur le concept et l'historique).
    fn novelty_score(&self, concept: &Concept) -> f64 {
        let count = self
            .history
            .iter()
            .filter(|h| h.concept == *concept)
            .count();
        // Score inversement proportionnel au nombre d'occurrences.
        1.0 / (1.0 + count as f64)
    }

    /// Génère un payload brut (v1 : placeholder structuré).
    fn parent_fragments(&self, parents: &[Uuid]) -> Vec<serde_json::Value> {
        parents
            .iter()
            .filter_map(|id| self.history.iter().find(|h| h.id == *id))
            .map(|h| h.payload.clone())
            .collect()
    }

    fn generate_raw_payload(
        &self,
        concept: &Concept,
        _world: &WorldState,
        fragments: &[serde_json::Value],
    ) -> serde_json::Value {
        serde_json::json!({
            "kind": "dream",
            "concept": format!("{:?}", concept),
            "raw": true,
            "recombined": !fragments.is_empty(),
            "fragments": fragments,
            "v": 1
        })
    }

    fn simulate(
        &self,
        concept: &Concept,
        world: &WorldState,
        fragments: &[serde_json::Value],
    ) -> SimulationTrace {
        let mut constraints = vec!["evidence_required_before_promotion".to_string()];
        if world.budget < concept.cost() as f64 {
            constraints.push("budget_insufficient".to_string());
        }
        if !fragments.is_empty() {
            constraints.push("uses_recombined_memory_fragments".to_string());
        }
        SimulationTrace {
            predicted_effects: vec![format!("would_attempt_{:?}", concept)],
            constraints,
            feasibility: (world.budget / concept.cost() as f64).clamp(0.0, 1.0),
        }
    }

    /// Sélectionne 0 à 2 parents parmi l'historique récent (v1 : aléatoire).
    fn select_parents(&mut self) -> Vec<Uuid> {
        let pool: Vec<&RawHypothesis> = self.history.iter().rev().take(10).collect();
        if pool.is_empty() {
            return Vec::new();
        }
        // Une mémoire disponible doit réellement pouvoir alimenter une nouvelle
        // construction : le premier cycle peut être libre, les suivants recombinent.
        let k = self.rng.random_range(1..=2).min(pool.len());
        let mut parents = Vec::with_capacity(k);
        let mut available: Vec<usize> = (0..pool.len()).collect();
        for _ in 0..k {
            if available.is_empty() {
                break;
            }
            let idx = self.rng.random_range(0..available.len());
            let real_idx = available.swap_remove(idx);
            parents.push(pool[real_idx].id);
        }
        parents
    }

    /// Historique des hypothèses (lecture seule).
    pub fn history(&self) -> &[RawHypothesis] {
        &self.history
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Concept, WorldState};
    use uuid::Uuid;

    #[test]
    fn test_dreaming_produces_hypotheses() {
        let config = CreativityConfig::default();
        let mut dreaming = DreamingPhase::new(config);
        let world = WorldState::default();
        let hypotheses = dreaming.dream(&world, 10.0, 0);
        assert!(!hypotheses.is_empty());
        for h in &hypotheses {
            assert!(!h.id.is_nil());
            assert!(h.novelty_score >= 0.0 && h.novelty_score <= 1.0);
            assert!(h.energy_cost_estimate >= 0.0);
        }
    }

    #[test]
    fn test_novelty_higher_for_new_concepts() {
        let config = CreativityConfig::default();
        let mut dreaming = DreamingPhase::new(config.clone());
        let _world = WorldState::default();
        let hyps: Vec<_> = (0..3)
            .map(|_| RawHypothesis {
                id: Uuid::new_v4(),
                concept: Concept::Observe,
                payload: serde_json::Value::Null,
                novelty_score: 0.0,
                energy_cost_estimate: 1.0,
                parent_hypotheses: vec![],
                source_fragments: vec![],
                simulation: SimulationTrace {
                    predicted_effects: vec![],
                    constraints: vec![],
                    feasibility: 1.0,
                },
                generated_at_tick: 0,
            })
            .collect();

        for h in hyps {
            dreaming.history.push(h);
        }
        let score_after = dreaming.novelty_score(&Concept::Observe);
        let score_before = DreamingPhase::new(config).novelty_score(&Concept::Observe);
        assert!(
            score_before > score_after,
            "nouveauté devrait être plus élevée pour un concept jamais vu"
        );
    }

    #[test]
    fn test_imagination_recombines_memory_and_simulates_before_execution() {
        let config = CreativityConfig::default();
        let mut dreaming = DreamingPhase::new(config);
        let world = WorldState::default();
        let _ = dreaming.dream(&world, 100.0, 0);
        let second_cycle = dreaming.dream(&world, 100.0, 1);

        assert!(second_cycle.iter().any(|hypothesis| {
            !hypothesis.parent_hypotheses.is_empty()
                && !hypothesis.source_fragments.is_empty()
                && hypothesis.payload["recombined"] == serde_json::Value::Bool(true)
        }));
        assert!(second_cycle.iter().all(|hypothesis| {
            !hypothesis.simulation.predicted_effects.is_empty()
                && hypothesis
                    .simulation
                    .constraints
                    .contains(&"evidence_required_before_promotion".to_string())
        }));
    }
}
