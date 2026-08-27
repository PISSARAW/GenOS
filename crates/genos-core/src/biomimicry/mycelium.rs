use std::collections::HashMap;

/// Edge in the fungal knowledge graph with dynamic conductivity.
#[derive(Clone, Debug)]
pub struct HyphalEdge {
    pub from_node: String,
    pub to_node: String,
    pub conductivity: f32,
    pub length: f32,
    pub last_flux: f32,
}

/// Fungal Mycelium Knowledge Routing Engine.
pub struct MyceliumNetworkEngine {
    edges: HashMap<(String, String), HyphalEdge>,
    decay_rate: f32,
    growth_exponent: f32,
}

impl MyceliumNetworkEngine {
    pub fn new(decay_rate: f32, growth_exponent: f32) -> Self {
        Self {
            edges: HashMap::new(),
            decay_rate: decay_rate.clamp(0.01, 0.2),
            growth_exponent: growth_exponent.clamp(1.0, 2.0),
        }
    }

    pub fn anastomose(&mut self, from: String, to: String, initial_conductivity: f32) {
        let key = (from.clone(), to.clone());
        let edge = HyphalEdge {
            from_node: from,
            to_node: to,
            conductivity: initial_conductivity.max(0.1),
            length: 1.0,
            last_flux: 0.0,
        };
        self.edges.insert(key, edge);
    }

    pub fn record_flux(&mut self, from: &str, to: &str, flux: f32) {
        let key = (from.to_string(), to.to_string());
        if let Some(edge) = self.edges.get_mut(&key) {
            edge.last_flux += flux;
        }
    }

    pub fn step_adaptation(&mut self, dt: f32) {
        let mut to_remove = Vec::new();

        for (key, edge) in self.edges.iter_mut() {
            let flux_term = edge.last_flux.powf(self.growth_exponent)
                / (1.0 + edge.last_flux.powf(self.growth_exponent));
            let d_conductivity = (flux_term - (self.decay_rate * edge.conductivity)) * dt;
            edge.conductivity = (edge.conductivity + d_conductivity).max(0.0);
            edge.last_flux = 0.0;

            if edge.conductivity < 0.001 {
                to_remove.push(key.clone());
            }
        }

        for key in to_remove {
            self.edges.remove(&key);
        }
    }

    pub fn route_knowledge(&self, source: &str, sink: &str) -> Option<Vec<String>> {
        let mut distances: HashMap<String, f32> = HashMap::new();
        let mut previous: HashMap<String, String> = HashMap::new();
        let mut unvisited: std::collections::BinaryHeap<ReverseEdge> =
            std::collections::BinaryHeap::new();

        distances.insert(source.to_string(), 0.0);
        unvisited.push(ReverseEdge {
            node: source.to_string(),
            cost: 0.0,
        });

        while let Some(ReverseEdge { node, cost }) = unvisited.pop() {
            if node == sink {
                let mut path = vec![sink.to_string()];
                let mut curr = sink.to_string();
                while let Some(prev) = previous.get(&curr) {
                    path.push(prev.clone());
                    curr = prev.clone();
                }
                path.reverse();
                return Some(path);
            }

            if cost > *distances.get(&node).unwrap_or(&f32::INFINITY) {
                continue;
            }

            for ((u, v), edge) in &self.edges {
                if u == &node && edge.conductivity > 0.001 {
                    let weight = edge.length / edge.conductivity;
                    let next_cost = cost + weight;
                    if next_cost < *distances.get(v).unwrap_or(&f32::INFINITY) {
                        distances.insert(v.clone(), next_cost);
                        previous.insert(v.clone(), u.clone());
                        unvisited.push(ReverseEdge {
                            node: v.clone(),
                            cost: next_cost,
                        });
                    }
                }
            }
        }

        None
    }
}

#[derive(Clone, Debug, PartialEq)]
struct ReverseEdge {
    node: String,
    cost: f32,
}

impl Eq for ReverseEdge {}

impl Ord for ReverseEdge {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        other
            .cost
            .partial_cmp(&self.cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    }
}

impl PartialOrd for ReverseEdge {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}
