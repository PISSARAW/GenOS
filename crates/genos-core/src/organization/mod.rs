use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrganizationStrategy {
    // Agent 1: Swarm
    Stigmergy,
    DemocraticConsensus,
    EmergentArchitecture,
    Polyethism,
    // Agent 2: Flocking
    Boids,
    FishSchoolSearch,
    SlimeMould,
    GreyWolfOptimizer,
    // Agent 3: Network
    MycoRouting,
    DynamicDifferentiation,
    QuorumSensing,
    LeaderElection,
    // Agent 4: Distributed
    DistributedTentacle,
    HuddlingRotation,
    CoupledOscillators,
}

pub trait OrganizationProtocol {
    /// Evalue la stratégie la plus adaptée à une tâche donnée.
    fn evaluate_best_strategy(task_complexity: u32, group_size: usize) -> OrganizationStrategy;

    /// Déclenche l'exécution selon la stratégie choisie, créant des sous-agents si nécessaire.
    fn execute_strategy(strategy: &OrganizationStrategy, task_id: &str) -> Result<(), String>;
}

pub mod distributed;
pub mod flocking;
pub mod network;
pub mod swarm;
pub mod symbiosis;
