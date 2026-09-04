use std::collections::HashMap;

/// Trait d'abstraction pour l'accès au métabolisme d'un agent.
/// Permet de découpler la logique gliale et biologique de l'AgentCell monolithique.
pub trait Metabolizable {
    fn energy_level(&self) -> f64;
    fn consume_energy(&mut self, amount: f64);
    fn produce_energy(&mut self, amount: f64);
    fn is_exhausted(&self) -> bool {
        self.energy_level() <= 0.0
    }
}

/// Structure d'entrée mémoire pour KuzuDB / LadybugDB
#[derive(Debug, Clone)]
pub struct MemoryEntry {
    pub id: String,
    pub content: String,
    pub embedding: Option<Vec<f32>>,
    pub tags: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct SearchQuery {
    pub text: Option<String>,
    pub vector: Option<Vec<f32>>,
    pub limit: usize,
}

/// Interface Repository abstrait pour le stockage mémoire
pub trait MemoryRepository: Send + Sync {
    fn store_memory(&self, entry: MemoryEntry) -> Result<(), String>;
    fn search(&self, query: SearchQuery) -> Result<Vec<MemoryEntry>, String>;
}

#[derive(Debug, Clone)]
pub struct TelemetryEvent {
    pub event_type: String,
    pub message: String,
    pub level: String,
}

/// Interface pour l'émission d'événements de télémétrie
pub trait Telemetry: Send + Sync {
    fn emit(&self, event: TelemetryEvent);
    fn flush(&self) -> Result<(), String>;
}
