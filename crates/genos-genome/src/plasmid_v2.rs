use rand::RngExt;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_PLASMID_POOL_SIZE: usize = 1024;

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
            metabolic_cost: bounded(params.metabolic_cost),
            replication_rate: bounded(params.replication_rate),
            stability: bounded(params.stability),
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
        self.maintain_with_rng(energy_budget, &mut rand::rng())
    }

    pub fn maintain_with_rng<R: RngExt + ?Sized>(
        &mut self,
        energy_budget: f64,
        rng: &mut R,
    ) -> bool {
        if energy_budget < self.metabolic_cost {
            self.stability = (self.stability - 0.1).clamp(0.0, 1.0);
        }
        rng.random::<f64>() > self.stability
    }

    pub fn replicate(&self) -> Option<PlasmidInstance> {
        self.replicate_with_rng(&mut rand::rng())
    }

    pub fn replicate_with_rng<R: RngExt + ?Sized>(&self, rng: &mut R) -> Option<PlasmidInstance> {
        if rng.random::<f64>() < self.replication_rate {
            let mut child = self.clone();
            child.id = Uuid::from_bytes(rng.random::<[u8; 16]>());
            child.generation = child.generation.saturating_add(1);
            Some(child)
        } else {
            None
        }
    }

    pub fn is_lost(&self, energy_budget: f64) -> bool {
        self.is_lost_with_rng(energy_budget, &mut rand::rng())
    }

    pub fn is_lost_with_rng<R: RngExt + ?Sized>(&self, energy_budget: f64, rng: &mut R) -> bool {
        let probability = if energy_budget < self.metabolic_cost {
            0.5
        } else {
            1.0 - self.stability
        };
        rng.random::<f64>() < probability.clamp(0.0, 1.0)
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
            energy_budget: if energy_budget.is_finite() {
                energy_budget.max(0.0)
            } else {
                0.0
            },
        }
    }

    pub fn add(&mut self, plasmid: PlasmidInstance) {
        let valid_instruction = !plasmid.instruction.trim().is_empty();
        let duplicate_id = self.plasmids.iter().any(|stored| stored.id == plasmid.id);
        if valid_instruction
            && !duplicate_id
            && self.plasmids.len() < MAX_PLASMID_POOL_SIZE
            && !self.has_compatible(&plasmid)
        {
            self.plasmids.push(plasmid);
        }
    }

    fn has_compatible(&self, candidate: &PlasmidInstance) -> bool {
        self.plasmids.iter().any(|p| !p.is_compatible(candidate))
    }

    pub fn cycle(&mut self) -> PlasmidCycleResult {
        self.cycle_with_rng(&mut rand::rng())
    }

    pub fn cycle_with_rng<R: RngExt + ?Sized>(&mut self, rng: &mut R) -> PlasmidCycleResult {
        let energy_budget = self.energy_budget;
        let current = self.plasmids.clone();

        let mut retained: Vec<PlasmidInstance> = Vec::new();
        let mut lost: Vec<Uuid> = Vec::new();
        let mut replicated: Vec<PlasmidInstance> = Vec::new();

        let mut used_budget = 0.0;
        for original in &current {
            let mut plasmid = original.clone();
            let remaining_budget = (energy_budget - used_budget).max(0.0);
            if plasmid.maintain_with_rng(remaining_budget, rng)
                || used_budget + plasmid.metabolic_cost > energy_budget
                || retained.len() + replicated.len() >= MAX_PLASMID_POOL_SIZE
            {
                lost.push(plasmid.id);
            } else {
                used_budget += plasmid.metabolic_cost;
                retained.push(plasmid.clone());
                if retained.len() + replicated.len() < MAX_PLASMID_POOL_SIZE {
                    if let Some(child) = plasmid
                        .replicate_with_rng(rng)
                        .filter(|child| used_budget + child.metabolic_cost <= energy_budget)
                    {
                        used_budget += child.metabolic_cost;
                        replicated.push(child);
                    }
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
            let conflicts = keep
                .iter()
                .any(|p: &PlasmidInstance| !p.is_compatible(plasmid));
            if !conflicts {
                keep.push(plasmid.clone());
            }
        }
        self.plasmids = keep;
    }
}

fn bounded(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        0.0
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
        pool.add(PlasmidInstance::new(plasmid((
            "UNSTABLE", 0.5, 0.1, "IncX",
        ))));

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

    #[test]
    fn pool_cycle_respects_total_energy_budget() {
        use rand::SeedableRng;
        let mut pool = PlasmidPool::new(0.2);
        pool.add(PlasmidInstance::new(plasmid(("A", 0.15, 1.0, "IncA"))));
        pool.add(PlasmidInstance::new(plasmid(("B", 0.15, 1.0, "IncB"))));
        let mut rng = rand::rngs::StdRng::seed_from_u64(12);
        pool.cycle_with_rng(&mut rng);
        assert!(pool.total_metabolic_cost() <= pool.energy_budget);
    }

    #[test]
    fn pool_growth_has_a_hard_ceiling() {
        let mut pool = PlasmidPool::new(1.0);
        for index in 0..=MAX_PLASMID_POOL_SIZE {
            pool.add(PlasmidInstance::new(plasmid((
                "A",
                0.0,
                1.0,
                &format!("Inc{index}"),
            ))));
        }
        assert_eq!(pool.plasmids.len(), MAX_PLASMID_POOL_SIZE);
    }

    #[test]
    fn seeded_replication_has_reproducible_instance_ids() {
        use rand::SeedableRng;
        let plasmid = PlasmidInstance::new(PlasmidParams {
            instruction: "REVIEW".to_string(),
            metabolic_cost: 0.1,
            replication_rate: 1.0,
            stability: 1.0,
            compatibility_group: "IncA".to_string(),
        });
        let mut first_rng = rand::rngs::StdRng::seed_from_u64(91);
        let mut second_rng = rand::rngs::StdRng::seed_from_u64(91);
        assert_eq!(
            plasmid.replicate_with_rng(&mut first_rng),
            plasmid.replicate_with_rng(&mut second_rng)
        );
    }
}
