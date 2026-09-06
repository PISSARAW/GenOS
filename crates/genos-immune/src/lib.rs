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
}
