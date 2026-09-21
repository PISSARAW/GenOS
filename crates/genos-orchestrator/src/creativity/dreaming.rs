use crate::creativity::creativity_engine::CreativityConfig;
use crate::planner::{WorldState, Concept};
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Hypothèse brute non évaluée (sortie DMN)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RawHypothesis {
    pub id: Uuid,
    pub concept: Concept,
    pub payload: Value,
    pub novelty_score: f64,
    pub energy_cost_estimate: f64,
    pub parent_hypotheses: Vec<Uuid>,
    pub generated_at_tick: u64,
    pub metadata: HashMap<String, Value>,
}

impl Default for RawHypothesis {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            concept: Concept::Observe,
            payload: Value::Null,
            novelty_score: 0.0,
            energy_cost_estimate: 1.0,
            parent_hypotheses: Vec::new(),
            generated_at_tick: 0,
            metadata: HashMap::new(),
        }
    }
}

/// Phase de rêve : exploration non contrainte (équivalent DMN)
pub struct DreamingPhase {
    config: CreativityConfig,
    history: Vec<RawHypothesis>,
    tick_counter: u64,
    concept_usage: HashMap<Concept, u32>,
}

impl DreamingPhase {
    pub fn new(config: CreativityConfig) -> Self {
        Self {
            config,
            history: Vec::new(),
            tick_counter: 0,
            concept_usage: HashMap::new(),
        }
    }

    /// Génère N hypothèses brutes depuis le DMN
    pub fn dream(&mut self, world: &WorldState, budget_atp: f64) -> Vec<RawHypothesis> {
        if budget_atp < self.config.atp_per_dream {
            return Vec::new();
        }

        let max_cycles = self.config.max_dream_cycles
            .min((budget_atp / self.config.atp_per_dream) as usize);
        let mut hypotheses = Vec::with_capacity(max_cycles);

        for _ in 0..max_cycles {
            let concept = self.sample_concept_exploratory(world);
            let payload = self.generate_raw_payload(&concept);
            let novelty = self.novelty_score(&concept, &payload);
            let parents = self.select_parents(&concept);

            let hyp = RawHypothesis {
                id: Uuid::new_v4(),
                concept,
                payload,
                novelty_score: novelty,
                energy_cost_estimate: self.config.atp_per_dream,
                parent_hypotheses: parents,
                generated_at_tick: self.tick_counter,
                metadata: HashMap::new(),
            };
            hypotheses.push(hyp);
        }

        for h in &hypotheses {
            *self.concept_usage.entry(h.concept).or_insert(0) += 1;
        }
        self.history.extend(hypotheses.clone());
        self.tick_counter += 1;
        hypotheses
    }

    /// Sélection exploratoire : favorise concepts peu utilisés
    fn sample_concept_exploratory(&self, world: &WorldState) -> Concept {
        let applicable: Vec<Concept> = Concept::all()
            .into_iter()
            .filter(|c| world.applicable(*c) && world.budget >= c.cost())
            .collect();

        if applicable.is_empty() {
            return Concept::Observe;
        }

        applicable.into_iter()
            .max_by(|a, b| {
                let score_a = self.exploration_score(a, world);
                let score_b = self.exploration_score(b, world);
                score_a.partial_cmp(&score_b).unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap_or(Concept::Observe)
    }

    fn exploration_score(&self, concept: &Concept, world: &WorldState) -> f64 {
        let usage = self.concept_usage.get(concept).copied().unwrap_or(0) as f64;
        let novelty_bonus = 1.0 / (1.0 + usage);
        let cost_factor = 1.0 / (1.0 + concept.cost() * 0.1);
        let budget_factor = (world.budget / concept.cost().max(1.0)).min(10.0).ln().max(0.0);

        novelty_bonus * 0.5 + cost_factor * 0.3 + budget_factor * 0.2
    }

    /// Génération payload libre selon le concept
    fn generate_raw_payload(&self, concept: &Concept) -> Value {
        match concept {
            Concept::Mutate => serde_json::json!({
                "mode": "exploratory",
                "target": "random_gene",
                "intensity": "low",
                "context": "dreaming"
            }),
            Concept::Cross => serde_json::json!({
                "mode": "speculative",
                "partner_criteria": "diverse",
                "context": "dreaming"
            }),
            Concept::Organize => serde_json::json!({
                "topology": "novel",
                "constraint": "none",
                "context": "dreaming"
            }),
            Concept::Delegate => serde_json::json!({
                "role": "experimental",
                "autonomy": "high",
                "context": "dreaming"
            }),
            Concept::Recruit => serde_json::json!({
                "profile": "unconventional",
                "context": "dreaming"
            }),
            _ => serde_json::json!({
                "mode": "free",
                "context": "dreaming"
            }),
        }
    }

    /// Score nouveauté vs historique + mémoire (v1: heuristique)
    fn novelty_score(&self, concept: &Concept, payload: &Value) -> f64 {
        let concept_rarity = 1.0 - (self.concept_usage.get(concept).copied().unwrap_or(0) as f64 / 100.0).min(1.0);
        let payload_complexity = self.payload_complexity(payload);
        let recency_penalty = self.recency_penalty(concept);

        (concept_rarity * 0.5 + payload_complexity * 0.3 + recency_penalty * 0.2).clamp(0.0, 1.0)
    }

    fn payload_complexity(&self, payload: &Value) -> f64 {
        match payload {
            Value::Object(map) => (map.len() as f64 / 10.0).min(1.0),
            Value::Array(arr) => (arr.len() as f64 / 10.0).min(1.0),
            _ => 0.1,
        }
    }

    fn recency_penalty(&self, concept: &Concept) -> f64 {
        if let Some(last_tick) = self.history.iter()
            .filter(|h| h.concept == *concept)
            .map(|h| h.generated_at_tick)
            .max() {
            let age = self.tick_counter.saturating_sub(last_tick);
            (age as f64 / 50.0).min(1.0)
        } else {
            1.0
        }
    }

    fn select_parents(&self, concept: &Concept) -> Vec<Uuid> {
        self.history.iter()
            .filter(|h| h.concept == *concept)
            .rev()
            .take(2)
            .map(|h| h.id)
            .collect()
    }

    pub fn history(&self) -> &[RawHypothesis] {
        &self.history
    }

    pub fn find_hypothesis(&self, id: Uuid) -> Option<&RawHypothesis> {
        self.history.iter().find(|h| h.id == id)
    }
}