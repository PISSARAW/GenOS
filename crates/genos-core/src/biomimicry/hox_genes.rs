//! Hox Genes mapped to structural capability ordering.
//!
//! Biological mechanism: Hox genes determine the basic structure and orientation
//! of an organism (antero-posterior axis). Their order on the chromosome matches
//! the order of expression in the body (colinearity).
//! GenOS mapping: A genome configuration declares an ordered sequence of capabilities.
//! This module enforces that tools and subsystems are activated in the exact
//! hierarchical order defined by the "Hox" blueprint, preventing malformed
//! capability graphs.

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum BodySegment {
    /// Foundational traits (e.g., identity, basic parsing)
    Anterior,
    /// Core logic and reasoning (e.g., MCTS, planners)
    Thorax,
    /// External actuators and memory (e.g., Tools, RAG)
    Posterior,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HoxGene {
    pub name: String,
    pub segment: BodySegment,
    pub position: usize,
}

#[derive(Debug, Clone, Default)]
pub struct HoxBlueprint {
    pub genes: Vec<HoxGene>,
}

impl HoxBlueprint {
    pub fn new() -> Self {
        Self { genes: Vec::new() }
    }

    pub fn add_gene(&mut self, name: String, segment: BodySegment, position: usize) {
        self.genes.push(HoxGene {
            name,
            segment,
            position,
        });
        self.genes.sort_by_key(|g| (g.segment.clone(), g.position));
    }

    /// Verifies if a given list of activated capabilities matches the strict
    /// colinearity imposed by the Hox blueprint.
    pub fn verify_colinearity(&self, activated_capabilities: &[String]) -> Result<(), String> {
        let mut expected_iter = self.genes.iter();

        for cap in activated_capabilities {
            let mut found = false;
            while let Some(gene) = expected_iter.next() {
                if &gene.name == cap {
                    found = true;
                    break;
                }
            }
            if !found {
                return Err(format!(
                    "Capability '{}' activated out of order or not in blueprint.",
                    cap
                ));
            }
        }
        Ok(())
    }
}
