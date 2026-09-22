use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PlasmidInstance {
    pub id: Uuid,
    pub instruction: String,
    pub metabolic_cost: f64,
    pub replication_rate: f64,
    pub stability: f64,
    pub compatibility_group: String,
    pub acquired_from: Option<Uuid>,
    pub acquired_at: u64,
    pub generation: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PlasmidParams {
    pub instruction: String,
    pub metabolic_cost: f64,
    pub replication_rate: f64,
    pub stability: f64,
    pub compatibility_group: String,
}

impl PlasmidInstance {
    pub fn new(params: PlasmidParams) -> Self {
        Self {
            id: Uuid::new_v4(),
            instruction: params.instruction,
            metabolic_cost: params.metabolic_cost.clamp(0.0, 1.0),
            replication_rate: params.replication_rate.clamp(0.0, 1.0),
            stability: params.stability.clamp(0.0, 1.0),
            compatibility_group: params.compatibility_group,
            acquired_from: None,
            acquired_at: 0,
            generation: 0,
        }
    }

    pub fn acquired(instruction: &str, source: Uuid, group: &str) -> Self {
        Self {
            id: Uuid::new_v4(),
            instruction: instruction.to_string(),
            metabolic_cost: 0.05,
            replication_rate: 0.3,
            stability: 0.5,
            compatibility_group: group.to_string(),
            acquired_from: Some(source),
            acquired_at: 0,
            generation: 0,
        }
    }

    pub fn maintain(&mut self, energy_budget: f64) -> bool {
        if energy_budget < self.metabolic_cost {
            self.stability -= 0.1;
        }
        rand::random::<f64>() > self.stability.max(0.0)
    }

    pub fn replicate(&self) -> Option<PlasmidInstance> {
        if rand::random::<f64>() < self.replication_rate {
            let mut child = self.clone();
            child.id = Uuid::new_v4();
            child.generation += 1;
            Some(child)
        } else {
            None
        }
    }

    pub fn is_lost(&self, energy_budget: f64) -> bool {
        if energy_budget < self.metabolic_cost {
            rand::random::<f64>() < 0.5
        } else {
            rand::random::<f64>() < (1.0 - self.stability)
        }
    }

    pub fn is_compatible(&self, other: &PlasmidInstance) -> bool {
        self.compatibility_group != other.compatibility_group
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PlasmidPool {
    pub plasmids: Vec<PlasmidInstance>,
    pub energy_budget: f64,
}

impl PlasmidPool {
    pub fn new(energy_budget: f64) -> Self {
        Self {
            plasmids: Vec::new(),
            energy_budget,
        }
    }

    pub fn add(&mut self, plasmid: PlasmidInstance) {
        if !self.has_compatible(&plasmid) {
            self.plasmids.push(plasmid);
        }
    }

    fn has_compatible(&self, candidate: &PlasmidInstance) -> bool {
        self.plasmids.iter().any(|p| !p.is_compatible(candidate))
    }

    pub fn cycle(&mut self) -> PlasmidCycleResult {
        let energy_budget = self.energy_budget;
        let current = self.plasmids.clone();

        let mut retained: Vec<PlasmidInstance> = Vec::new();
        let mut lost: Vec<Uuid> = Vec::new();
        let mut replicated: Vec<PlasmidInstance> = Vec::new();

        for plasmid in &current {
            if plasmid.is_lost(energy_budget) {
                lost.push(plasmid.id);
            } else {
                retained.push(plasmid.clone());
                if let Some(child) = plasmid.replicate() {
                    replicated.push(child);
                }
            }
        }

        let replicated_count = replicated.len();
        retained.extend(replicated);
        let result = PlasmidCycleResult {
            retained_count: retained.len(),
            lost_count: lost.len(),
            replicated_count,
        };
        self.plasmids = retained;
        result
    }

    pub fn total_metabolic_cost(&self) -> f64 {
        self.plasmids.iter().map(|p| p.metabolic_cost).sum()
    }

    pub fn prune_incompatible(&mut self) {
        let mut keep = Vec::new();
        for plasmid in &self.plasmids {
            let conflicts = keep.iter().any(|p: &PlasmidInstance| !p.is_compatible(plasmid));
            if !conflicts {
                keep.push(plasmid.clone());
            }
        }
        self.plasmids = keep;
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct PlasmidCycleResult {
    pub retained_count: usize,
    pub lost_count: usize,
    pub replicated_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plasmid(params: (&str, f64, f64, &str)) -> PlasmidParams {
        PlasmidParams {
            instruction: params.0.to_string(),
            metabolic_cost: params.1,
            replication_rate: 0.0,
            stability: params.2,
            compatibility_group: params.3.to_string(),
        }
    }

    #[test]
    fn plasmid_lost_without_energy() {
        let mut p = PlasmidInstance::new(plasmid(("TOOL_X", 0.5, 0.1, "IncF")));
        let mut lost = false;
        for _ in 0..100 {
            if p.maintain(0.0) {
                lost = true;
                break;
            }
        }
        assert!(lost);
    }

    #[test]
    fn plasmid_replication_probabilistic() {
        let p = PlasmidInstance::new(PlasmidParams {
            instruction: "TOOL_Y".to_string(),
            metabolic_cost: 0.05,
            replication_rate: 0.8,
            stability: 0.9,
            compatibility_group: "IncI".to_string(),
        });
        let mut replicated = false;
        for _ in 0..100 {
            if p.replicate().is_some() {
                replicated = true;
                break;
            }
        }
        assert!(replicated);
    }

    #[test]
    fn plasmid_incompatibility_prevents_add() {
        let mut pool = PlasmidPool::new(1.0);
        pool.add(PlasmidInstance::new(plasmid(("A", 0.1, 0.5, "IncF"))));
        pool.add(PlasmidInstance::new(plasmid(("B", 0.1, 0.5, "IncF"))));
        assert_eq!(pool.plasmids.len(), 1);
    }

    #[test]
    fn plasmid_pool_cycle_prunes_lost() {
        let mut pool = PlasmidPool::new(0.0);
        pool.add(PlasmidInstance::new(plasmid(("UNSTABLE", 0.5, 0.1, "IncX"))));

        let mut any_lost = false;
        for _ in 0..10 {
            let result = pool.cycle();
            if result.lost_count > 0 {
                any_lost = true;
                break;
            }
        }
        assert!(any_lost);
    }

    #[test]
    fn plasmid_acquired_from_hgt() {
        let source_id = Uuid::new_v4();
        let p = PlasmidInstance::acquired("RESISTANCE_GENE", source_id, "IncA");
        assert_eq!(p.acquired_from, Some(source_id));
        assert_eq!(p.metabolic_cost, 0.05);
    }
}
