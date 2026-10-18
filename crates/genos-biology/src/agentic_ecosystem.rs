use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Référence légère vers un agent de l'écosystème.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentRef {
    pub id: Uuid,
    pub role: String,
    pub niche_id: Option<String>,
}

/// Une niche écologique avec capacité et occupation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Niche {
    pub id: String,
    pub capacity: u32,
    pub occupancy: u32,
}

impl Niche {
    pub fn new(id: &str, capacity: u32) -> Self {
        Self {
            id: id.to_string(),
            capacity,
            occupancy: 0,
        }
    }

    pub fn has_space(&self) -> bool {
        self.occupancy < self.capacity
    }
}

/// Un biome regroupant des niches et des agents.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Biome {
    pub id: String,
    pub name: String,
    pub productivity: f64,
}

/// Écosystème agentique : agents, niches et biomes.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgenticEcosystem {
    pub agents: Vec<AgentRef>,
    pub niches: Vec<Niche>,
    pub biomes: Vec<Biome>,
}

impl Default for AgenticEcosystem {
    fn default() -> Self {
        Self {
            agents: Vec::new(),
            niches: Vec::new(),
            biomes: Vec::new(),
        }
    }
}

impl AgenticEcosystem {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_agent(&mut self, agent: AgentRef) {
        self.agents.push(agent);
    }

    pub fn add_niche(&mut self, niche: Niche) {
        self.niches.push(niche);
    }

    pub fn add_biome(&mut self, biome: Biome) {
        self.biomes.push(biome);
    }

    /// Assigne un agent à une niche si de la place est disponible.
    pub fn assign_niche(&mut self, agent_id: Uuid, niche_id: &str) -> Result<(), String> {
        let niche_exists = self.niches.iter().any(|n| n.id == niche_id);
        if !niche_exists {
            return Err(format!("niche {} not found", niche_id));
        }
        let agent = self
            .agents
            .iter_mut()
            .find(|a| a.id == agent_id)
            .ok_or_else(|| format!("agent {} not found", agent_id))?;
        if agent.niche_id.is_some() {
            return Err("agent already assigned to a niche".to_string());
        }
        let niche = self
            .niches
            .iter_mut()
            .find(|n| n.id == niche_id)
            .ok_or_else(|| format!("niche {} not found", niche_id))?;
        if !niche.has_space() {
            return Err("niche at full capacity".to_string());
        }
        niche.occupancy += 1;
        agent.niche_id = Some(niche_id.to_string());
        Ok(())
    }

    /// Nombre d'agents non assignés à une niche.
    pub fn unassigned_count(&self) -> u32 {
        self.agents.iter().filter(|a| a.niche_id.is_none()).count() as u32
    }

    /// Occupation moyenne des niches.
    pub fn mean_niche_occupancy(&self) -> f64 {
        if self.niches.is_empty() {
            return 0.0;
        }
        let total: u32 = self.niches.iter().map(|n| n.occupancy).sum();
        total as f64 / self.niches.len() as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assign_niche_succeeds_when_space_available() {
        let mut eco = AgenticEcosystem::new();
        let agent_id = Uuid::new_v4();
        eco.add_agent(AgentRef {
            id: agent_id,
            role: "worker".to_string(),
            niche_id: None,
        });
        eco.add_niche(Niche::new("debug", 2));
        assert!(eco.assign_niche(agent_id, "debug").is_ok());
        assert_eq!(eco.unassigned_count(), 0);
    }

    #[test]
    fn assign_niche_fails_at_full_capacity() {
        let mut eco = AgenticEcosystem::new();
        eco.add_niche(Niche::new("debug", 1));
        let a1 = Uuid::new_v4();
        let a2 = Uuid::new_v4();
        eco.add_agent(AgentRef {
            id: a1,
            role: "worker".to_string(),
            niche_id: None,
        });
        eco.add_agent(AgentRef {
            id: a2,
            role: "worker".to_string(),
            niche_id: None,
        });
        assert!(eco.assign_niche(a1, "debug").is_ok());
        assert!(eco.assign_niche(a2, "debug").is_err());
        assert_eq!(eco.unassigned_count(), 1);
    }

    #[test]
    fn assign_niche_fails_for_unknown_agent() {
        let mut eco = AgenticEcosystem::new();
        eco.add_niche(Niche::new("debug", 2));
        assert!(eco.assign_niche(Uuid::new_v4(), "debug").is_err());
    }

    #[test]
    fn mean_occupancy_is_zero_for_empty() {
        let eco = AgenticEcosystem::new();
        assert_eq!(eco.mean_niche_occupancy(), 0.0);
    }
}
