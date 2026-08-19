use std::collections::HashMap;

/// Niveaux de modèles pour l'optimisation des tokens.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelTier {
    FlashLite, // Pour les tâches de routine
    Pro,       // Pour la synthèse
}

/// État global (Tableau Noir / Stigmergie) remplaçant l'historique des requêtes.
pub struct SharedState {
    pub data: HashMap<String, String>,
}

impl SharedState {
    pub fn new() -> Self {
        Self {
            data: HashMap::new(),
        }
    }

    pub fn write(&mut self, key: String, val: String) {
        self.data.insert(key, val);
    }

    pub fn read(&self, key: &str) -> Option<String> {
        self.data.get(key).cloned()
    }
}

/// Représente l'environnement où les phéromones sont déposées (Stigmergie).
pub struct Environment {
    pheromones: HashMap<(i32, i32), f64>,
}

impl Environment {
    pub fn new() -> Self {
        Self {
            pheromones: HashMap::new(),
        }
    }

    pub fn deposit(&mut self, x: i32, y: i32) {
        let entry = self.pheromones.entry((x, y)).or_insert(0.0);
        *entry += 1.0;
    }

    pub fn get_pheromone(&self, x: i32, y: i32) -> f64 {
        *self.pheromones.get(&(x, y)).unwrap_or(&0.0)
    }
}

/// Représente le mécanisme de consensus (Consensus).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Decision {
    Explore,
    Exploit,
    Rest,
}

pub struct Consensus {
    votes: HashMap<Decision, usize>,
}

impl Consensus {
    pub fn new() -> Self {
        Self {
            votes: HashMap::new(),
        }
    }

    pub fn vote(&mut self, decision: Decision) {
        let count = self.votes.entry(decision).or_insert(0);
        *count += 1;
    }

    pub fn resolve(&self) -> Option<Decision> {
        self.votes
            .iter()
            .max_by_key(|&(_, count)| count)
            .map(|(decision, _)| decision.clone())
    }
}

/// Représente l'architecture du nid (Architecture).
pub struct Nest {
    pub size: usize,
    pub food_stored: usize,
}

impl Nest {
    pub fn new() -> Self {
        Self {
            size: 1,
            food_stored: 0,
        }
    }

    pub fn expand(&mut self, amount: usize) {
        self.size += amount;
    }

    pub fn store_food(&mut self, amount: usize) {
        self.food_stored += amount;
    }
}

/// Rôles pour le polyéthisme (Polyéthisme).
#[derive(Debug, Clone, Copy)]
pub enum Role {
    Forager,
    Builder,
    Nurse,
}

pub struct Agent {
    pub id: usize,
    pub role: Role,
    pub tier: ModelTier,
}

impl Agent {
    pub fn new(id: usize, role: Role, tier: ModelTier) -> Self {
        Self { id, role, tier }
    }

    pub fn assign_role(&mut self, new_role: Role) {
        self.role = new_role;
    }

    pub fn perform_task(&self, nest: &mut Nest, env: &mut Environment) {
        match self.role {
            Role::Forager => {
                env.deposit(0, 0);
                nest.store_food(1);
            }
            Role::Builder => {
                nest.expand(1);
            }
            Role::Nurse => {
                // S'occupe du couvain, simplifié pour cet exemple.
            }
        }
    }
}

/// Structure qui représente l'essaim global combinant toutes ces caractéristiques.
pub struct Swarm {
    pub agents: Vec<Agent>,
    pub nest: Nest,
    pub env: Environment,
    pub consensus: Consensus,
    pub shared_state: SharedState,
}

impl Swarm {
    pub fn new() -> Self {
        Self {
            agents: Vec::new(),
            nest: Nest::new(),
            env: Environment::new(),
            consensus: Consensus::new(),
            shared_state: SharedState::new(),
        }
    }

    pub fn add_agent(&mut self, agent: Agent) {
        self.agents.push(agent);
    }
}
