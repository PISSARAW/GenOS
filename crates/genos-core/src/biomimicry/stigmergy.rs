use std::collections::HashMap;

/// Directed edge between two AST or workspace entity identifiers.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PheromoneEdge {
    pub from_node: String,
    pub to_node: String,
}

/// Digital pheromone state on a specific edge.
#[derive(Clone, Debug)]
pub struct PheromoneState {
    pub positive_trail: f32,
    pub negative_trail: f32,
    pub last_updated_epoch: u64,
}

/// Quantitative Stigmergic Coordination Engine.
pub struct StigmergyEngine {
    edges: HashMap<PheromoneEdge, PheromoneState>,
    evaporation_rate: f32,
    base_deposit_constant: f32,
    negative_penalty_weight: f32,
    current_epoch: u64,
}

impl StigmergyEngine {
    pub fn new(evaporation_rate: f32, base_deposit: f32) -> Self {
        Self {
            edges: HashMap::new(),
            evaporation_rate: evaporation_rate.clamp(0.01, 0.5),
            base_deposit_constant: base_deposit.max(1.0),
            negative_penalty_weight: 1.5,
            current_epoch: 0,
        }
    }

    pub fn deposit_positive(&mut self, edge: PheromoneEdge, cost: f32) {
        let deposit = self.base_deposit_constant / cost.max(1.0);
        let state = self.edges.entry(edge).or_insert(PheromoneState {
            positive_trail: 1.0,
            negative_trail: 0.0,
            last_updated_epoch: self.current_epoch,
        });
        state.positive_trail += deposit;
    }

    pub fn deposit_negative(&mut self, edge: PheromoneEdge, severity: f32) {
        let state = self.edges.entry(edge).or_insert(PheromoneState {
            positive_trail: 1.0,
            negative_trail: 0.0,
            last_updated_epoch: self.current_epoch,
        });
        state.negative_trail += severity.max(0.1);
    }

    pub fn get_effective_trail(&self, edge: &PheromoneEdge) -> f32 {
        match self.edges.get(edge) {
            Some(state) => {
                let raw = state.positive_trail - (self.negative_penalty_weight * state.negative_trail);
                raw.max(0.01)
            }
            None => 1.0,
        }
    }

    pub fn step_evaporation(&mut self) {
        self.current_epoch += 1;
        for state in self.edges.values_mut() {
            state.positive_trail = (1.0 - self.evaporation_rate) * state.positive_trail;
            state.negative_trail = (1.0 - self.evaporation_rate) * state.negative_trail;
        }
    }
}
