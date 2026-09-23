use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const GRN_ITERATIONS: usize = 8;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GRNNode {
    pub locus: String,
    pub basal_expression: f64,
    pub current_expression: f64,
    pub is_tf: bool,
}

impl GRNNode {
    pub fn new(locus: String, basal_expression: f64, is_tf: bool) -> Self {
        Self {
            locus,
            basal_expression,
            current_expression: basal_expression,
            is_tf,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GRNEdge {
    pub source: String,
    pub target: String,
    pub weight: f64,
    pub threshold: f64,
}

impl GRNEdge {
    pub fn new(params: GRNEdgeParams) -> Self {
        Self {
            source: params.source,
            target: params.target,
            weight: params.weight,
            threshold: params.threshold.max(0.0),
        }
    }
}

#[derive(Clone, Debug)]
pub struct GRNEdgeParams {
    pub source: String,
    pub target: String,
    pub weight: f64,
    pub threshold: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GRNNodeParams {
    pub locus: String,
    pub basal_expression: f64,
    pub is_tf: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GRN {
    pub nodes: HashMap<String, GRNNode>,
    pub edges: Vec<GRNEdge>,
}

impl GRN {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            edges: Vec::new(),
        }
    }

    pub fn add_node(&mut self, params: GRNNodeParams) {
        let locus = params.locus.clone();
        self.nodes.insert(
            locus.clone(),
            GRNNode::new(params.locus, params.basal_expression, params.is_tf),
        );
    }

    pub fn add_edge(&mut self, params: GRNEdgeParams) {
        if self.nodes.contains_key(&params.source) && self.nodes.contains_key(&params.target) {
            self.edges.push(GRNEdge::new(params));
        }
    }

    pub fn propagate(&mut self) {
        for _ in 0..GRN_ITERATIONS {
            let mut updates: Vec<(String, f64)> = Vec::new();

            for node in self.nodes.values() {
                let input: f64 = self
                    .edges
                    .iter()
                    .filter(|e| e.target == node.locus)
                    .map(|e| {
                        let source_expr = self
                            .nodes
                            .get(&e.source)
                            .map_or(0.0, |n| n.current_expression);
                        e.weight * source_expr
                    })
                    .sum();

                let expr = (node.basal_expression + input.tanh() * 0.5).clamp(0.0, 1.0);
                updates.push((node.locus.clone(), expr.clamp(0.0, 1.0)));
            }

            for (locus, expr) in updates {
                if let Some(node) = self.nodes.get_mut(&locus) {
                    node.current_expression = expr;
                }
            }
        }
    }

    pub fn get_expression(&self, locus: &str) -> Option<f64> {
        self.nodes.get(locus).map(|n| n.current_expression)
    }

    pub fn stress_activate(&mut self, level: f64) {
        for node in self.nodes.values_mut() {
            node.basal_expression = (node.basal_expression + level * 0.1).clamp(0.0, 1.0);
            node.current_expression = node.basal_expression;
        }
    }
}

impl Default for GRN {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(locus: &str, basal: f64, is_tf: bool) -> GRNNodeParams {
        GRNNodeParams {
            locus: locus.to_string(),
            basal_expression: basal,
            is_tf,
        }
    }

    fn edge(params: (&str, &str, f64, f64)) -> GRNEdgeParams {
        GRNEdgeParams {
            source: params.0.to_string(),
            target: params.1.to_string(),
            weight: params.2,
            threshold: params.3,
        }
    }

    #[test]
    fn grn_propagation_converges() {
        let mut grn = GRN::new();
        grn.add_node(node("TF_A", 0.8, true));
        grn.add_node(node("GENE_B", 0.5, false));
        grn.add_node(node("GENE_C", 0.3, false));

        grn.add_edge(edge(("TF_A", "GENE_B", 0.9, 0.3)));
        grn.add_edge(edge(("TF_A", "GENE_C", -0.7, 0.3)));

        grn.propagate();

        assert!(
            grn.get_expression("GENE_B").unwrap() > 0.5,
            "GENE_B should be activated by TF_A"
        );
        assert!(
            grn.get_expression("GENE_C").unwrap() < 0.3,
            "GENE_C should be repressed by TF_A"
        );
    }

    #[test]
    fn grn_stress_basal_increases() {
        let mut grn = GRN::new();
        grn.add_node(node("GENE_X", 0.2, false));
        grn.stress_activate(1.0);
        assert!(grn.get_expression("GENE_X").unwrap() > 0.2);
    }

    #[test]
    fn grn_default_works() {
        let grn: GRN = Default::default();
        assert!(grn.nodes.is_empty());
        assert!(grn.edges.is_empty());
    }
}
