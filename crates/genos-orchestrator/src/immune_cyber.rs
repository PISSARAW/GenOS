//! Immunité cyber : honeypots (autotomie), disjoncteur, gossip, régénération.

use genos_immune::{AutotomyModule, CircuitBreaker, CircuitState, GossipNode, StemCellRegenerator};

/// Défenses cyber-systémiques de l'orchestrateur.
pub struct CyberImmune {
    pub autotomy: AutotomyModule,
    pub breaker: CircuitBreaker,
    pub gossip: GossipNode,
    pub regenerator: StemCellRegenerator,
}

impl Default for CyberImmune {
    fn default() -> Self {
        Self::new("orchestrator")
    }
}

impl CyberImmune {
    pub fn new(node_id: &str) -> Self {
        Self {
            autotomy: AutotomyModule::new(),
            breaker: CircuitBreaker::new(3),
            gossip: GossipNode::new(node_id),
            regenerator: StemCellRegenerator::new(),
        }
    }

    pub fn add_honeypot(&mut self, id: &str) {
        self.autotomy.add_honeypot(id);
    }

    /// Sacrifie un leurre : renvoie true si le noyau reste sain.
    pub fn defend(&mut self, target_id: &str) -> bool {
        self.autotomy.trigger_attack(target_id)
    }

    pub fn record_failure(&mut self) {
        self.breaker.record_failure();
    }

    pub fn record_success(&mut self) {
        self.breaker.record_success();
    }

    pub fn allowed(&self) -> bool {
        self.breaker.is_allowed()
    }

    pub fn breaker_state(&self) -> CircuitState {
        self.breaker.state
    }

    pub fn begin_recovery(&mut self) -> bool {
        self.breaker.begin_recovery_probe()
    }

    pub fn broadcast_threat(&mut self, threat: &str, peer: &mut GossipNode) {
        self.gossip.receive_threat(threat);
        self.gossip.share_with(peer);
    }

    pub fn register_service(&mut self, service: &str) {
        self.regenerator.register_blueprint(service);
        self.regenerator.start_service(service);
    }

    pub fn is_running(&self, service: &str) -> bool {
        self.regenerator.is_running(service)
    }
}
