// c:\Users\Shadow\Documents\GitHub\GenOS\crates\genos-core\src\resilience\cyber_immune.rs
// Implémentation modulaire du système cyber-immunitaire inspiré de la biologie.

use std::collections::{HashMap, HashSet};

/// 1. Autotomie (Honeypot / Lezard Tail)
/// Consiste à sacrifier une partie non critique pour protéger le cœur du système.
pub struct AutotomyModule {
    honeypots: HashMap<String, bool>,
    pub core_safe: bool,
}

impl AutotomyModule {
    pub fn new() -> Self {
        Self {
            honeypots: HashMap::new(),
            core_safe: true,
        }
    }

    pub fn add_honeypot(&mut self, id: &str) {
        self.honeypots.insert(id.to_string(), true);
    }

    pub fn trigger_attack(&mut self, target_id: &str) -> bool {
        if self.honeypots.contains_key(target_id) {
            // On sacrifie le honeypot (passe à false). L'attaque est absorbée.
            self.honeypots.insert(target_id.to_string(), false);
            true
        } else {
            // L'attaque touche une zone critique.
            self.core_safe = false;
            false
        }
    }
}

/// 2. Gossip Protocol (Réseau Mycorhizien)
/// Les noeuds partagent l'information de menace de proche en proche.
pub struct GossipNode {
    pub id: String,
    pub threats: HashSet<String>,
}

impl GossipNode {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            threats: HashSet::new(),
        }
    }

    pub fn receive_threat(&mut self, threat: &str) {
        self.threats.insert(threat.to_string());
    }

    pub fn share_with(&self, peer: &mut GossipNode) {
        for threat in &self.threats {
            peer.receive_threat(threat);
        }
    }
}

/// 3. Régénération (Cellules Souches)
/// Capacité de recréer des services tombés à partir de plans initiaux.
pub struct StemCellRegenerator {
    active_services: HashSet<String>,
    blueprints: HashSet<String>,
}

impl StemCellRegenerator {
    pub fn new() -> Self {
        Self {
            active_services: HashSet::new(),
            blueprints: HashSet::new(),
        }
    }

    pub fn register_blueprint(&mut self, service: &str) {
        self.blueprints.insert(service.to_string());
    }

    pub fn start_service(&mut self, service: &str) {
        if self.blueprints.contains(service) {
            self.active_services.insert(service.to_string());
        }
    }

    pub fn handle_failure(&mut self, service: &str) {
        self.active_services.remove(service);
        self.regenerate(service);
    }

    fn regenerate(&mut self, service: &str) {
        if self.blueprints.contains(service) {
            self.start_service(service);
        }
    }
}

/// 4. Circuit Breaker (Coagulation)
/// Bloque les requêtes vers un service défaillant pour éviter l'hémorragie en cascade.
pub enum CircuitState {
    Closed, // Le sang coule normalement
    Open,   // Coagulation active (bloqué)
}

pub struct CircuitBreaker {
    pub state: CircuitState,
    failure_count: u32,
    threshold: u32,
}

impl CircuitBreaker {
    pub fn new(threshold: u32) -> Self {
        Self {
            state: CircuitState::Closed,
            failure_count: 0,
            threshold,
        }
    }

    pub fn success(&mut self) {
        self.failure_count = 0;
        self.state = CircuitState::Closed;
    }

    pub fn failure(&mut self) {
        self.failure_count += 1;
        if self.failure_count >= self.threshold {
            self.state = CircuitState::Open;
        }
    }

    pub fn is_allowed(&self) -> bool {
        matches!(self.state, CircuitState::Closed)
    }
}
