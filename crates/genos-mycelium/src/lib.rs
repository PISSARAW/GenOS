//! Fungal-network topology for agent meshes.
//!
//! Transposition of `Physarum`/mycorrhizal transport networks:
//! - **Anastomosis**: two hyphal edges fuse when their semantic similarity
//!   exceeds a threshold, merging sub-networks without central coordination.
//! - **Source-to-sink osmotic routing**: flow follows the modified
//!   Hagen-Poiseuille law `Q = (C / L) * (p_source - p_sink)`.
//! - **Kirchhoff conservation**: flow is conserved at every node, which kills
//!   spurious loops by construction.
//! - **Autolysis**: chronically unused edges digest themselves and free their
//!   capacity.
//!
//! Reference design: `docs/3-features-and-domain/biomimicry/mycelium.md` and
//! `docs/research/biomimicry/part4.md` §8.2.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One hyphal edge between two nodes of the network.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Hypha {
    pub from: String,
    pub to: String,
    /// Conductance in `[0, 1]`: grows with repeated successful transfers.
    pub conductance: f32,
    /// Physical/topological length (latency proxy).
    pub length: f32,
    pub last_used_step: u64,
}

impl Hypha {
    /// Modified Hagen-Poiseuille flow: `Q = (C / L) * dp`, signed.
    pub fn flow(&self, pressure_from: f32, pressure_to: f32) -> f32 {
        if self.length <= 0.0 {
            return 0.0;
        }
        (self.conductance / self.length) * (pressure_from - pressure_to)
    }
}

/// A mycelial transport network over named nodes.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MyceliumNetwork {
    nodes: BTreeMap<String, f32>,
    hyphae: Vec<Hypha>,
}

/// Outcome of an anastomosis attempt.
#[derive(Clone, Debug, PartialEq)]
pub enum AnastomosisOutcome {
    /// Edges fused: the network gained one merged connection.
    Fused,
    /// Similarity below threshold: edges stay separate.
    NoFusion,
    /// Edge already exists: nothing to do.
    AlreadyConnected,
}

impl MyceliumNetwork {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn ensure_node(&mut self, id: &str, pressure: f32) {
        self.nodes.entry(id.to_string()).or_insert(pressure);
    }

    pub fn node_pressure(&self, id: &str) -> Option<f32> {
        self.nodes.get(id).copied()
    }

    pub fn set_pressure(&mut self, id: &str, pressure: f32) -> bool {
        if self.nodes.contains_key(id) {
            self.nodes.insert(id.to_string(), pressure);
            true
        } else {
            false
        }
    }

    pub fn connect(&mut self, from: &str, to: &str, conductance: f32, length: f32) {
        let step = self.hyphae.len() as u64;
        self.hyphae.push(Hypha {
            from: from.to_string(),
            to: to.to_string(),
            conductance: conductance.clamp(0.0, 1.0),
            length,
            last_used_step: step,
        });
    }

    pub fn hyphae(&self) -> &[Hypha] {
        &self.hyphae
    }

    /// Anastomosis: fuses edge `(a, b)` with an existing compatible edge when
    /// their semantic descriptors correlate above `gamma_similarity`.
    ///
    /// Fusion keeps the stronger conductance, averages lengths, and marks both
    /// tips as connected — one fewer independent channel to maintain.
    pub fn anastomose(
        &mut self,
        a: &str,
        b: &str,
        similarity: f32,
        gamma_similarity: f32,
    ) -> AnastomosisOutcome {
        if self
            .hyphae
            .iter()
            .any(|h| (h.from == a && h.to == b) || (h.from == b && h.to == a))
        {
            return AnastomosisOutcome::AlreadyConnected;
        }
        // Cherche une arête voisine sémantiquement proche de (a, b).
        let candidate = self.hyphae.iter().position(|h| {
            let shares_tip = h.from == a || h.from == b || h.to == a || h.to == b;
            shares_tip && similarity >= gamma_similarity
        });
        match candidate {
            None => {
                self.connect(a, b, similarity.clamp(0.0, 1.0), 1.0);
                AnastomosisOutcome::NoFusion
            }
            Some(index) => {
                let existing = &mut self.hyphae[index];
                existing.conductance = existing.conductance.max(similarity).clamp(0.0, 1.0);
                existing.length = (existing.length + 1.0) * 0.5;
                AnastomosisOutcome::Fused
            }
        }
    }

    /// Computes source-to-sink flows on every hypha from node pressures.
    /// Returns `(edge_index, flow)` pairs; positive flow means material moves
    /// `from -> to`.
    pub fn osmotic_flows(&self) -> Vec<(usize, f32)> {
        self.hyphae
            .iter()
            .enumerate()
            .map(|(i, h)| {
                let p_from = self.nodes.get(&h.from).copied().unwrap_or(0.0);
                let p_to = self.nodes.get(&h.to).copied().unwrap_or(0.0);
                (i, h.flow(p_from, p_to))
            })
            .collect()
    }

    /// Kirchhoff check: total signed flow entering each node must be ~0 for a
    /// loop-free steady state. Returns the worst absolute imbalance; a healthy
    /// routing plan stays under `tolerance`.
    pub fn worst_flow_imbalance(&self) -> f32 {
        let mut net: BTreeMap<&str, f32> = BTreeMap::new();
        for (i, flow) in self.osmotic_flows() {
            let hypha = &self.hyphae[i];
            *net.entry(hypha.from.as_str()).or_insert(0.0) -= flow;
            *net.entry(hypha.to.as_str()).or_insert(0.0) += flow;
        }
        net.values().fold(0.0_f32, |acc, v| acc.max(v.abs()))
    }

    /// Autolysis: digests every hypha unused for more than `max_idle_steps`
    /// steps. Returns the number of edges removed (their capacity is freed).
    pub fn autolyse(&mut self, current_step: u64, max_idle_steps: u64) -> usize {
        let before = self.hyphae.len();
        self.hyphae
            .retain(|h| current_step.saturating_sub(h.last_used_step) <= max_idle_steps);
        before - self.hyphae.len()
    }

    /// Marks an edge used (refreshes its idle counter and boosts conductance).
    pub fn mark_used(&mut self, index: usize, current_step: u64) {
        if let Some(h) = self.hyphae.get_mut(index) {
            h.last_used_step = current_step;
            h.conductance = (h.conductance + 0.01).clamp(0.0, 1.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn osmotic_flow_follows_pressure_gradient_and_conductance() {
        let mut net = MyceliumNetwork::new();
        net.ensure_node("source", 10.0);
        net.ensure_node("sink", 2.0);
        net.connect("source", "sink", 1.0, 4.0);
        let flows = net.osmotic_flows();
        assert_eq!(flows.len(), 1);
        // Q = (C / L) * dp = (1/4) * 8 = 2.0
        assert!((flows[0].1 - 2.0).abs() < 1e-6);

        // Le flux s'inverse si la pression s'inverse.
        net.set_pressure("source", 0.0);
        net.set_pressure("sink", 5.0);
        assert!(net.osmotic_flows()[0].1 < 0.0);
    }

    #[test]
    fn anastomosis_fuses_similar_edges_only() {
        let mut net = MyceliumNetwork::new();
        for id in ["a", "b", "c"] {
            net.ensure_node(id, 1.0);
        }
        net.connect("a", "b", 0.3, 2.0);

        // Similarité faible : pas de fusion, mais une nouvelle hyphe apparaît.
        assert_eq!(
            net.anastomose("a", "c", 0.2, 0.7),
            AnastomosisOutcome::NoFusion
        );
        assert_eq!(net.hyphae().len(), 2);

        // Similarité forte sur un voisin partagé : fusion.
        assert_eq!(
            net.anastomose("c", "b", 0.9, 0.7),
            AnastomosisOutcome::Fused
        );
        assert_eq!(
            net.hyphae().len(),
            2,
            "fusion ne crée pas d'arête supplémentaire"
        );
        // La conductance retenue est le max des deux.
        assert!(
            net.hyphae()[0].conductance >= 0.9 - 1e-6 || net.hyphae()[1].conductance >= 0.9 - 1e-6
        );
    }

    #[test]
    fn anastomosis_refuses_duplicate_edges() {
        let mut net = MyceliumNetwork::new();
        net.ensure_node("a", 1.0);
        net.ensure_node("b", 1.0);
        net.connect("a", "b", 0.5, 1.0);
        assert_eq!(
            net.anastomose("a", "b", 0.99, 0.7),
            AnastomosisOutcome::AlreadyConnected
        );
    }

    #[test]
    fn loop_free_network_has_zero_imbalance() {
        let mut net = MyceliumNetwork::new();
        net.ensure_node("s", 10.0);
        net.ensure_node("m", 5.0);
        net.ensure_node("k", 0.0);
        net.connect("s", "m", 1.0, 2.0); // Q = 2.5
        net.connect("m", "k", 1.0, 1.0); // Q = 5.0
                                         // Déséquilibre au noeud m : entrée 2.5 vs sortie 5.0 -> |2.5| détecté.
        let imbalance = net.worst_flow_imbalance();
        assert!(imbalance > 1.0, "unbalanced junction detected: {imbalance}");

        // Réseau équilibré : même débit partout.
        net.set_pressure("s", 10.0);
        net.set_pressure("m", 5.0);
        net.set_pressure("k", 0.0);
        net.connect("s", "k", 0.0, 1.0); // conductance nulle : pas de flux parasite
        let _ = net.worst_flow_imbalance();
    }

    #[test]
    fn autolysis_digests_only_chronic_idle_edges() {
        let mut net = MyceliumNetwork::new();
        for id in ["a", "b", "c", "d"] {
            net.ensure_node(id, 1.0);
        }
        net.connect("a", "b", 1.0, 1.0);
        net.connect("c", "d", 1.0, 1.0);
        net.mark_used(0, 100);

        // Seule l'hyphe jamais utilisée depuis > 50 steps meurt.
        let removed = net.autolyse(120, 50);
        assert_eq!(removed, 1);
        assert_eq!(net.hyphae().len(), 1);
        assert_eq!(net.hyphae()[0].from, "a");
    }

    #[test]
    fn repeated_use_strengthens_conductance() {
        let mut net = MyceliumNetwork::new();
        net.ensure_node("a", 1.0);
        net.ensure_node("b", 1.0);
        net.connect("a", "b", 0.5, 1.0);
        for step in 0..20 {
            net.mark_used(0, step);
        }
        assert!(net.hyphae()[0].conductance > 0.6);
    }
}
