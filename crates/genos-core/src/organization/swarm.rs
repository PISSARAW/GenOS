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

impl Default for SharedState {
    fn default() -> Self {
        Self::new()
    }
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

impl Default for Environment {
    fn default() -> Self {
        Self::new()
    }
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

impl Default for Consensus {
    fn default() -> Self {
        Self::new()
    }
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

impl Default for Nest {
    fn default() -> Self {
        Self::new()
    }
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
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Role {
    Forager,
    Builder,
    Nurse,
}

// Âge-polyéthisme : la rotation des rôles suit l'âge de l'individu.
pub const NURSE_MAX_AGE: u32 = 10;
pub const BUILDER_MAX_AGE: u32 = 20;

impl Role {
    /// Rôle canonique pour un âge donné : couvain (jeune) -> construction
    /// (mûr) -> fourrageage (âgé). C'est le schéma d'âge-polyéthisme observé
    /// chez les fourmis ouvrières.
    pub fn for_age(age: u32) -> Self {
        if age < NURSE_MAX_AGE {
            Role::Nurse
        } else if age < BUILDER_MAX_AGE {
            Role::Builder
        } else {
            Role::Forager
        }
    }
}

pub struct Agent {
    pub id: usize,
    pub role: Role,
    pub tier: ModelTier,
    /// Âge de l'ouvrière en cycles ; pilote sa rotation de rôle.
    pub age: u32,
}

impl Agent {
    pub fn new(id: usize, role: Role, tier: ModelTier) -> Self {
        Self { id, role, tier, age: 0 }
    }

    pub fn assign_role(&mut self, new_role: Role) {
        self.role = new_role;
    }

    /// Vieillit d'un cycle et applique l'âge-polyéthisme : le rôle est mis à
    /// jour automatiquement selon la tranche d'âge atteinte.
    pub fn age_one_cycle(&mut self) {
        self.age += 1;
        self.role = Role::for_age(self.age);
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

#[cfg(test)]
mod age_polyethism_tests {
    use super::*;

    #[test]
    fn roles_rotate_with_age() {
        let mut ant = Agent::new(1, Role::Nurse, ModelTier::FlashLite);
        assert_eq!(ant.role, Role::Nurse);

        // Jeune : nurse jusqu'à NURSE_MAX_AGE.
        for _ in 0..NURSE_MAX_AGE {
            assert_eq!(ant.role, Role::Nurse);
            ant.age_one_cycle();
        }
        // Mûr : builder.
        for _ in 0..(BUILDER_MAX_AGE - NURSE_MAX_AGE) {
            assert_eq!(ant.role, Role::Builder);
            ant.age_one_cycle();
        }
        // Âgée : forager, définitivement.
        for _ in 0..5 {
            assert_eq!(ant.role, Role::Forager);
            ant.age_one_cycle();
        }
    }

    #[test]
    fn manual_assignment_is_possible_but_age_wins_next_cycle() {
        let mut ant = Agent::new(2, Role::Nurse, ModelTier::Pro);
        ant.assign_role(Role::Forager);
        assert_eq!(ant.role, Role::Forager);
        // Le cycle suivant réaligne le rôle sur la tranche d'âge.
        ant.age_one_cycle();
        assert_eq!(ant.role, Role::for_age(ant.age));
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

impl Default for Swarm {
    fn default() -> Self {
        Self::new()
    }
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
