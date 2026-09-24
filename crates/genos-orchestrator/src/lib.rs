pub mod conscience;
pub mod core_self;
pub mod self_evolution;
pub(crate) mod execution_api;
pub mod clinical_therapy;
pub mod autopoiesis;
pub mod behaviors;
pub mod diagnostics;
pub mod director;
pub mod director_persistence;
pub mod dna_ops;
pub mod drives;
pub mod ecosystem;
pub mod ecosystem_params;
pub mod environment;
pub mod evolution;
pub mod evolution_types;
pub mod genome_ops;
pub mod global_workspace;
pub mod immune_cyber;
pub mod instincts;
pub mod learning;
pub mod membrane_chemistry;
pub mod metabolism;
pub mod neuro;
pub mod observer;
pub mod orchestrator;
pub mod organism;
pub mod organization;
pub mod phylogeny;
pub mod physics;
pub mod physical_telemetry;
pub mod plasmids;
pub mod planner;
pub mod recruitment;
pub mod reproduction_cycle;
pub mod sensory;
pub mod signaling;
pub mod snapshots;
pub mod tissue_scheduler;
pub mod token_bucket;
pub mod trace;
pub mod virology;
pub mod sensorimotor;
pub mod tick;
pub mod volition;
pub mod worlds;
pub mod kernel_state;
pub mod kernel_diagnosis;
pub mod kernel_resolvers;
pub mod kernel_morphogenesis;
pub mod kernel_incarnation;
pub mod kernel_morphogenesis_lease;
pub mod kernel_governance;
pub mod kernel_cycle;

#[cfg(feature = "api")]
pub mod thalamus;

pub use conscience::{Conscience, CognitiveRegulationState};
#[deprecated(since = "0.3", note = "Use CognitiveRegulationState instead")]
pub type ConscienceState = CognitiveRegulationState;
pub use autopoiesis::{Membrane, SelfModel, SelfRepairReport};
pub use director::{Decision, Director, Step, Strategy};
pub use drives::{AutonomyGateReport, Drives, GoalSelector, Volition};
pub use ecosystem_params::{CrossoverParams, FreezeParams, OscillatorParams, ThawParams};
pub use ecosystem::GenosEcosystem;
pub use environment::{Action, EmbodiedReport, Environment, Feedback, FileSandbox, Percept, ProcessSandbox};
pub use evolution::{EvolutionReport, Individual, InnovationBlocked, Island, Population, QualityProof};
pub use global_workspace::{
    BroadcastEffect, GlobalWorkspaceReport, WorkspaceConsumer, WorkspaceEvent, WorkspaceSignal,
};
pub use core_self::{
    AgencyAttribution, AgencyComparator, Claim, CognitiveProvenance, CoreSelf, CoreSelfState,
    Intention, ObservedOutcome,
};
pub use instincts::{InstinctActivation, InstinctState};
pub use metabolism::Metabolism;
pub use learning::{LinearBandit, Learner, context_from_state};
pub use orchestrator::BiomimeticOrchestrator;
pub use organism::{OrganismConfig, OrganismReport};
pub use organization::{Organization, Superorganism, catalog, select_organization, select_superorganism};
pub use physics::{
    ActionProfile, DecisionContext, Material, PhysicalState, Regime, UtilityInputs, action_profile,
    classify_material, classify_material_explicit, determine_regime, inertia_threshold, utility_score,
};
pub use physical_telemetry::PhysicalTelemetry;
pub use plasmids::{PlasmidBank, Skill};
pub use trace::{Outcome, ReplayReport, Verdict};
pub use tick::{MissionReport, TickReport};
pub use volition::VolitionState;
pub use worlds::{Hypothesis, Multiverse, WorldOutcome};
pub use planner::{Concept, Goal, WorldState, ActionStats};
pub use recruitment::{Candidate, Demand, RecruitmentDecision, RecruitmentPlanner, Selection};
pub use token_bucket::{AgentComputeBucket, BucketState, PenaltyReport, RewardReport, SchedulingDecision, TokenBucketScheduler};
pub use tissue_scheduler::{
    InProcessPoolConfig, InProcessTask, InProcessTaskResult, InProcessWorkerPool, PoolHealth,
    SchedulerHealth, SquadBudget, SquadHealth, SquadTask, SquadTaskResult,
    TissueBudget, TissueHealth, TissueScheduler, TissueSchedulerConfig, WorkerBudget,
};

// Accès direct à tout l'écosystème GenOS depuis le crate orchestrateur.
pub use genos_biology;
pub use genos_cell;
pub use genos_worker;
pub use genos_common;
pub use genos_dna;
pub use genos_genome;
pub use genos_immune;
pub use genos_reproduction;
pub use genos_sensorimotor;
pub use genos_signal;
pub use genos_store;

/// Accès à la couche API GenOS (activé par la feature `api`).
#[cfg(feature = "api")]
pub use genos_api;

/// Raccourcis vers les concepts API (sécurité + types de complétion).
#[cfg(feature = "api")]
pub mod api {
    pub use genos_api::security::{RateLimiter, TenantAuth};
    pub use genos_api::types::{
        ChatChoice, ChatCompletionRequest, ChatCompletionResponse, ChatMessage, ChatOutputMessage,
        ChatUsage, HealthResponse,
    };
    pub use genos_api::{handle_http_request, start_server};
}

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
            ("TRANSLATION_SUCCESS", "translation completed"),
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
