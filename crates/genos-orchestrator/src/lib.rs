pub mod conscience;
pub mod orchestrator;
pub mod token_bucket;

pub use conscience::{Conscience, ConscienceState};
pub use orchestrator::BiomimeticOrchestrator;
pub use token_bucket::{AgentComputeBucket, BucketState, PenaltyReport, RewardReport, SchedulingDecision, TokenBucketScheduler};

#[cfg(test)]
mod tests {
    use super::*;
    use genos_biology::bioluminescence::FluorophoreColor;
    use genos_biology::spore::SporeType;
    use genos_cell::AgentCell;

    #[test]
    fn test_biomimetic_orchestrator_lifecycle() {
        let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
        assert_eq!(orch.name, "Griot_Prime");

        // 1. Formation d'un tissu
        let _tissue = orch.create_tissue("Core_Engine", "Backend Logic").unwrap();
        let worker = AgentCell::new("Chidi", "Esprit logique", "Worker");
        let worker_id = orch.add_worker("Core_Engine", worker).unwrap();

        // 2. Délégation Desmosome
        let delegation = orch.delegate_task("Core_Engine", (worker_id, "Compiler les noyaux"));
        assert!(delegation.is_ok());
        assert!(delegation.unwrap().contains("Desmosome"));

        // 3. Anti-collusion : échec si signal trop peu cher (< 500 tokens)
        let cheap_audit = orch.audit_collusion("Core_Engine", ("Chidi", 100, true));
        assert!(cheap_audit.is_err());

        // 4. Anti-collusion : succès si signal cher (>= 500 tokens) et réalité validée
        let good_audit = orch.audit_collusion("Core_Engine", ("Chidi", 600, true));
        assert!(good_audit.is_ok());

        // 5. Évaluation de la Conscience
        let state = orch.evaluate_worker(worker_id, (0, 10.0)).unwrap();
        assert!(!state.is_apoptotic);

        // 6. Sporulation & Germination
        let spore_idx = orch.sporulate_cell(worker_id, SporeType::BacterialEndospore).unwrap();
        assert_eq!(orch.dormant_spores.len(), 1);
        let revived = orch.germinate_spore(spore_idx, (true, true)).unwrap();
        assert_eq!(revived.role, "Bacterial Vegetative Cell");

        // 7. Résilience génétique (dégénérescence du codon)
        let res_tool = orch.execute_tool_resilient("git_commit", "git_comit");
        assert!(res_tool.is_ok());
        assert!(res_tool.unwrap().contains("dégénérescence"));

        // 8. Embryogenèse
        let swarm = orch.cleave_and_differentiate(2, 1.0);
        assert!(!swarm.is_empty());

        // 9. Télémétrie bioluminescente
        orch.emit_bioluminescence(
            FluorophoreColor::Green,
            "Ribosome",
            ("TRANSLATION_SUCCESS", "Synthèse protéique achevée"),
        );
    }

    #[test]
    fn test_orchestrator_uses_immune_selection() {
        let mut orch = BiomimeticOrchestrator::new("Immune_Prime", 50.0, 100.0);
        orch.immune_selection.detectors.push(genos_immune::AntibodyDetector::new("SQL", "SQL_INJECTION", 0.8));
        let antigen = genos_immune::Antigen { id: "threat-1".into(), epitope: "SQL_INJECTION".into(), danger_level: 0.9 };
        assert!(orch.detect_immune_threat(&antigen));
        assert_eq!(orch.immune_selection.memory_pool.len(), 1);
    }

    #[test]
    fn test_token_bucket_scheduler_lifecycle() {
        let mut scheduler = TokenBucketScheduler::new();
        scheduler.register_agent("worker-1", 50.0, 100.0);

        // 1. Initial compute step allowed
        let decision = scheduler.schedule_step("worker-1", 20.0);
        match decision {
            SchedulingDecision::Allowed { allocated_tokens, remaining_tokens, .. } => {
                assert_eq!(allocated_tokens, 20.0);
                assert!((remaining_tokens - 30.0).abs() < 1e-3);
            }
            _ => panic!("Expected compute to be allowed"),
        }

        // 2. Proof reward adds tokens and expands capacity on high score
        let report = scheduler.reward_proof("worker-1", 0.95).unwrap();
        assert_eq!(report.capacity, 120.0);
        assert!(report.new_balance > 30.0);

        // 3. Waste penalty drains tokens
        let penalty = scheduler.penalize_waste("worker-1", 0.8).unwrap();
        assert!(penalty.deducted_tokens >= 25.0);

        // 4. Heavy waste causes throttling / sleep
        let drain = scheduler.penalize_waste("worker-1", 1.0).unwrap();
        assert!(matches!(drain.state, BucketState::Throttled { .. } | BucketState::Apoptotic));
    }
}
