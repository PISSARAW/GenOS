pub mod ais;
pub mod cyber_immune;
pub mod virology;

pub use ais::{AntibodyDetector, Antigen, ClonalSelection};
pub use cyber_immune::{AutotomyModule, CircuitBreaker, CircuitState, GossipNode, StemCellRegenerator};
pub use virology::{Bacteriophage, Retrovirus, Virion};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_autotomy_and_honeypot() {
        let mut auto = AutotomyModule::new();
        auto.add_honeypot("sandbox_node_1");
        assert!(auto.trigger_attack("sandbox_node_1"));
        assert!(auto.core_safe);
        assert!(!auto.trigger_attack("production_db"));
        assert!(!auto.core_safe);
    }

    #[test]
    fn test_antibody_detection() {
        let mut ais = ClonalSelection::new();
        ais.detectors.push(AntibodyDetector::new("DET_1", "SQL_INJECTION", 0.8));
        let ag = Antigen {
            id: "AG_1".into(),
            epitope: "SQL_INJECTION_OR_1=1".into(),
            danger_level: 0.9,
        };
        assert!(ais.recognize(&ag));
    }

    #[test]
    fn test_clonal_memory_deduplicates_recognitions() {
        let mut ais = ClonalSelection::new();
        ais.detectors.push(AntibodyDetector::new("DET_1", "SQL_INJECTION", 0.8));
        let antigen = Antigen { id: "AG_1".into(), epitope: "SQL_INJECTION".into(), danger_level: 0.9 };

        for _ in 0..1_000 {
            assert!(ais.recognize(&antigen));
        }

        assert_eq!(ais.memory_pool.len(), 1);
    }

    #[test]
    fn test_affinity_threshold_is_bounded() {
        assert_eq!(AntibodyDetector::new("low", "x", -1.0).affinity_threshold, 0.0);
        assert_eq!(AntibodyDetector::new("high", "x", 2.0).affinity_threshold, 1.0);
        assert_eq!(AntibodyDetector::new("nan", "x", f64::NAN).affinity_threshold, 1.0);
    }

    #[test]
    fn test_circuit_breaker_recovers_through_half_open() {
        let mut breaker = CircuitBreaker::new(2);
        breaker.record_failure();
        breaker.record_failure();
        assert_eq!(breaker.state, CircuitState::Open);
        assert!(breaker.begin_recovery_probe());
        assert_eq!(breaker.state, CircuitState::HalfOpen);
        assert!(breaker.is_allowed());
        breaker.record_success();
        assert_eq!(breaker.state, CircuitState::Closed);
    }

    #[test]
    fn test_clonal_memory_persists() {
        let path = std::env::temp_dir().join(format!("genos-immune-{}.json", uuid::Uuid::new_v4()));
        let mut selection = ClonalSelection::new();
        selection.detectors.push(AntibodyDetector::new("DET_1", "SQL", 0.8));
        assert!(selection.recognize(&Antigen { id: "AG_1".into(), epitope: "SQL".into(), danger_level: 0.9 }));
        selection.save(&path).unwrap();
        let restored = ClonalSelection::load(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        assert_eq!(restored.memory_pool.len(), 1);
    }

    #[test]
    fn test_gossip_and_service_regeneration() {
        let mut source = GossipNode::new("source");
        let mut peer = GossipNode::new("peer");
        source.receive_threat("command-injection");
        source.share_with(&mut peer);
        assert!(peer.threats.contains("command-injection"));

        let mut regenerator = StemCellRegenerator::new();
        regenerator.register_blueprint("worker");
        regenerator.start_service("worker");
        regenerator.handle_failure("worker");
        assert!(regenerator.is_running("worker"));
    }

    #[test]
    fn test_virology_preserves_payloads() {
        let virion = Virion::new_bacteriophage("agent-receptor", "halt");
        assert!(virion.is_lytic);
        assert_eq!(virion.envelope_spike, "agent-receptor");

        let retrovirus = Retrovirus::new("receptor", "repair");
        assert_eq!(retrovirus.reverse_transcribe(), genos_genome::DnaStrand::synthesize("repair"));
    }
}
