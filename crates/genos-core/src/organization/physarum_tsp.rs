use super::flocking::Vec2;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TspNode {
    pub id: usize,
    pub pos: Vec2,
}

#[derive(Clone, Debug)]
pub struct PhysarumEdge {
    pub from: usize,
    pub to: usize,
    pub length: f32,
    pub conductivity: f32,
    pub flux: f32,
}

pub struct PhysarumTspSolver {
    pub nodes: Vec<TspNode>,
    pub edges: Vec<PhysarumEdge>,
}

impl PhysarumTspSolver {
    pub fn new(nodes: Vec<TspNode>) -> Self {
        let mut edges = Vec::new();
        // Fully connected graph
        for i in 0..nodes.len() {
            for j in (i + 1)..nodes.len() {
                let p1 = &nodes[i].pos;
                let p2 = &nodes[j].pos;
                let dist = p1.sub(p2).mag();
                edges.push(PhysarumEdge {
                    from: i,
                    to: j,
                    length: dist.max(0.001), // avoid div by zero
                    conductivity: 1.0,       // initial uniform conductivity
                    flux: 0.0,
                });
            }
        }
        Self { nodes, edges }
    }

    /// Excute une itration de la simulation de Physarum.
    /// Modlise le renforcement des chemins courts (loi de Hagen-Poiseuille simplifie).
    pub fn step(&mut self) {
        // En gnral, on rsout un systme d"quations linaires pour les pressions.
        // Ici, implmentation heuristique O(E) pour simuler la rponse du Physarum:
        // Q = (D / L) * (P_source - P_sink) -> on simplifie pour le TSP
        for edge in self.edges.iter_mut() {
            // Le flux est d"autant plus grand que le chemin est court et la conductivit leve
            edge.flux = edge.conductivity / edge.length;
        }

        // Mise  jour de la conductivit : renforcement proportionnel au flux (adaptation)
        let decay = 0.1; // taux d"autolyse (dgradation)
        let reinforcement = 1.2;

        // Trouver le max flux pour normaliser (empche divergence)
        let max_flux = self
            .edges
            .iter()
            .map(|e| e.flux)
            .fold(0.0, f32::max)
            .max(1.0);

        for edge in self.edges.iter_mut() {
            let normalized_flux = edge.flux / max_flux;
            edge.conductivity =
                (edge.conductivity * (1.0 - decay)) + (normalized_flux * reinforcement);
            // On limite pour viter l"explosion et la mort totale
            edge.conductivity = edge.conductivity.clamp(0.01, 10.0);
        }
    }

    /// Extrait le chemin optimal (le plus conducteur).
    pub fn get_best_tour(&self) -> Vec<usize> {
        // Greedy extraction for demonstration
        if self.nodes.is_empty() {
            return vec![];
        }
        let mut tour = vec![0];
        let mut visited = vec![false; self.nodes.len()];
        visited[0] = true;

        let mut current = 0;
        for _ in 1..self.nodes.len() {
            let mut best_next = current;
            let mut best_cond = -1.0;

            for edge in &self.edges {
                if edge.from == current && !visited[edge.to] && edge.conductivity > best_cond {
                    best_cond = edge.conductivity;
                    best_next = edge.to;
                } else if edge.to == current && !visited[edge.from] && edge.conductivity > best_cond
                {
                    best_cond = edge.conductivity;
                    best_next = edge.from;
                }
            }
            if best_next != current {
                tour.push(best_next);
                visited[best_next] = true;
                current = best_next;
            }
        }
        tour
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_physarum_tsp() {
        let nodes = vec![
            TspNode {
                id: 0,
                pos: Vec2::new(0.0, 0.0),
            },
            TspNode {
                id: 1,
                pos: Vec2::new(0.0, 10.0),
            },
            TspNode {
                id: 2,
                pos: Vec2::new(10.0, 10.0),
            },
            TspNode {
                id: 3,
                pos: Vec2::new(10.0, 0.0),
            },
        ];
        let mut solver = PhysarumTspSolver::new(nodes);
        for _ in 0..10 {
            solver.step();
        }
        let tour = solver.get_best_tour();
        assert_eq!(tour.len(), 4);
    }
}
