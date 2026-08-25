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
    /// Évalue l'erreur survenue et sélectionne la meilleure stratégie de survie.
    fn evaluate_error(error_severity: u32, context_state: &str) -> ErrorStrategy;

    /// Déclenche l'exécution de la stratégie de résilience sélectionnée.
    fn execute_recovery(strategy: &ErrorStrategy, agent_id: &str) -> Result<(), String>;
}

pub mod ais;
pub mod cellular;
pub mod cleaner;
pub mod cyber_immune;
pub mod disaster;
pub mod mavirus;
pub mod viral_dynamics;
pub mod virophage;
pub mod prophage;