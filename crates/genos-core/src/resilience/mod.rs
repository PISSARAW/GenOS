use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ErrorStrategy {
    // Agent 1: Cellular & Active Defense
    Apoptosis,
    CoditSandboxing,
    Nociception,
    DlqIsolation,
    // Agent 2: Distributed Cyber-Defense
    AutotomyHoneypot,
    GossipProtocol,
    StemCellRegeneration,
    CircuitBreaker,
    // Agent 3: Disaster Recovery
    Cryptobiosis,
    ZeroTrustMicrobiome,
    HotCodeSwapping,
    ChaosEngineering,
    // Agent 4: Cleaner & Offensive Security
    FuzzingHypermutation,
    AutophagyGarbageCollection,
    ActiveRedundancy,
    RateLimitingTorpor,
}

pub trait ResilienceProtocol {
    /// Ã‰value l'erreur survenue et sÃ©lectionne la meilleure stratÃ©gie de survie.
    fn evaluate_error(error_severity: u32, context_state: &str) -> ErrorStrategy;

    /// DÃ©clenche l'exÃ©cution de la stratÃ©gie de rÃ©silience sÃ©lectionnÃ©e.
    fn execute_recovery(strategy: &ErrorStrategy, agent_id: &str) -> Result<(), String>;
}

pub mod antigenic_drift;
pub mod ais;
pub mod caspase;
pub mod cellular;
pub mod cleaner;
pub mod cyber_immune;
pub mod disaster;
pub mod mavirus;
pub mod mimivire;
pub mod provocation;
pub mod viral_dynamics;
pub mod virophage;
pub mod prophage;
pub mod codit;
