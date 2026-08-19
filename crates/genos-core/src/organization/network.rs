// network.rs
//
// Implémentation modulaire des algorithmes d'organisation inspirés de la nature.
//
// 1. Mycorhizes : Partage de ressources en réseau.
// 2. Siphonophores : Spécialisation des entités pour un but commun.
// 3. Quorum Sensing : Prise de décision décentralisée basée sur la densité.
// 4. Rat-taupe (Eusocialité) : Division du travail par castes.
// 5. Zero-Shot Worker : Optimisation tokens avec silence réseau.

// ==========================================
// 1. Mycorhizes (Réseau de partage)
// ==========================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceType {
    Water,
    Nutrients,
    Information,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resource {
    pub r_type: ResourceType,
    pub amount: u32,
}

pub struct MycorrhizalNode {
    pub id: u32,
    pub resources: Vec<Resource>,
}

impl MycorrhizalNode {
    pub fn new(id: u32) -> Self {
        Self {
            id,
            resources: Vec::new(),
        }
    }

    pub fn add_resource(&mut self, resource: Resource) {
        self.resources.push(resource);
    }

    // Max 3 paramètres respecté (self, target, r_type)
    pub fn transfer_to(&mut self, target: &mut MycorrhizalNode, r_type: ResourceType) {
        if let Some(index) = self.resources.iter().position(|r| r.r_type == r_type) {
            let res = self.resources.remove(index);
            target.add_resource(res);
        }
    }
}

// ==========================================
// 2. Siphonophores (Colonie spécialisée)
// ==========================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ZooidRole {
    Propulsion,
    Digestion,
    Defense,
}

pub struct Zooid {
    pub id: u32,
    pub role: ZooidRole,
    pub active: bool,
}

impl Zooid {
    pub fn new(id: u32, role: ZooidRole) -> Self {
        Self {
            id,
            role,
            active: true,
        }
    }

    pub fn execute_role(&self) -> &'static str {
        if !self.active {
            return "Inactive";
        }
        
        match self.role {
            ZooidRole::Propulsion => "Moving the colony",
            ZooidRole::Digestion => "Processing food",
            ZooidRole::Defense => "Protecting colony",
        }
    }
}

pub struct SiphonophoreColony {
    pub zooids: Vec<Zooid>,
}

impl SiphonophoreColony {
    pub fn new() -> Self {
        Self { zooids: Vec::new() }
    }

    pub fn add_zooid(&mut self, zooid: Zooid) {
        self.zooids.push(zooid);
    }

    pub fn act_together(&self) -> Vec<&'static str> {
        self.zooids.iter().map(|z| z.execute_role()).collect()
    }
}

// ==========================================
// 3. Quorum Sensing (Décision décentralisée)
// ==========================================

pub struct BacteriaNode {
    pub id: u32,
    pub autoinducer_level: u32,
}

impl BacteriaNode {
    pub fn new(id: u32) -> Self {
        Self {
            id,
            autoinducer_level: 0,
        }
    }

    pub fn sense_environment(&mut self, local_density: u32) {
        self.autoinducer_level = local_density * 2;
    }

    pub fn should_activate(&self, threshold: u32) -> bool {
        self.autoinducer_level >= threshold
    }
}

// ==========================================
// 4. Rat-taupe Nu (Organisation Eusociale)
// ==========================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Caste {
    Queen,
    Worker,
    Soldier,
}

pub struct MoleRat {
    pub id: u32,
    pub caste: Caste,
    pub health: u32,
}

impl MoleRat {
    pub fn new(id: u32, caste: Caste) -> Self {
        Self {
            id,
            caste,
            health: 100,
        }
    }

    pub fn perform_duty(&self) -> &'static str {
        match self.caste {
            Caste::Queen => "Reproducing and leading",
            Caste::Worker => "Foraging and digging",
            Caste::Soldier => "Defending the burrow",
        }
    }

    pub fn take_damage(&mut self, damage: u32) {
        self.health = self.health.saturating_sub(damage);
    }
}

// ==========================================
// 5. Zero-Shot Worker & Silence Réseau
// ==========================================

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentStatus {
    Pending,
    Success,
    Critical,
}

pub struct ZeroShotPrompt {
    pub instruction: String,
    // Structure de prompt impérative, sans contexte global
}

pub struct NetworkAgent {
    pub id: u32,
    pub local_buffer: Vec<String>,
    pub status: AgentStatus,
}

impl NetworkAgent {
    pub fn new(id: u32) -> Self {
        Self {
            id,
            local_buffer: Vec::new(),
            status: AgentStatus::Pending,
        }
    }

    pub fn process_prompt(&mut self, prompt: ZeroShotPrompt) {
        self.local_buffer.push(prompt.instruction);
    }

    pub fn set_status(&mut self, status: AgentStatus) {
        self.status = status;
    }

    // Silence Réseau : Ne se déverse vers l'orchestrateur que sur Critical ou Success
    pub fn flush_to_orchestrator(&mut self) -> Option<Vec<String>> {
        match self.status {
            AgentStatus::Critical | AgentStatus::Success => {
                let data = std::mem::take(&mut self.local_buffer);
                Some(data)
            }
            _ => None,
        }
    }
}
