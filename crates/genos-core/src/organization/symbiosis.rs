use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SymbiosisType {
    /// Both agents benefit (resource sharing, trust boost)
    Mutualism,
    /// One agent benefits at the expense of the other
    Parasitism,
    /// One agent benefits, the other is unaffected
    Commensalism,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SymbioticRelationship {
    pub host_id: String,
    pub symbiont_id: String,
    pub relationship_type: SymbiosisType,
    pub interaction_strength: f32,
}

impl SymbioticRelationship {
    pub fn new(host_id: String, symbiont_id: String, rel_type: SymbiosisType) -> Self {
        Self {
            host_id,
            symbiont_id,
            relationship_type: rel_type,
            interaction_strength: 0.1,
        }
    }

    /// Process a cycle of interaction between host and symbiont.
    /// Returns the resource delta (host_delta, symbiont_delta)
    pub fn process_interaction(&mut self) -> (f32, f32) {
        // Strengthen relationship over time up to 1.0
        self.interaction_strength = (self.interaction_strength + 0.05).min(1.0);

        match self.relationship_type {
            SymbiosisType::Mutualism => {
                let benefit = 10.0 * self.interaction_strength;
                (benefit, benefit)
            }
            SymbiosisType::Parasitism => {
                let drained = 15.0 * self.interaction_strength;
                (-drained, drained)
            }
            SymbiosisType::Commensalism => {
                let benefit = 5.0 * self.interaction_strength;
                (0.0, benefit)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mutualism() {
        let mut rel = SymbioticRelationship::new("host1".into(), "sym1".into(), SymbiosisType::Mutualism);
        let (hd, sd) = rel.process_interaction();
        assert!(hd > 0.0);
        assert!(sd > 0.0);
        assert_eq!(hd, sd);
    }

    #[test]
    fn test_parasitism() {
        let mut rel = SymbioticRelationship::new("host2".into(), "sym2".into(), SymbiosisType::Parasitism);
        let (hd, sd) = rel.process_interaction();
        assert!(hd < 0.0);
        assert!(sd > 0.0);
    }
}

