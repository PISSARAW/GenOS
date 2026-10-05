use crate::adversarial_types::{
    AdversarialInjection, AdversarialScenario, FailureMode, InjectionPattern, InjectionTarget,
    InjectionType, ScenarioCategory, ScenarioTemplate, SuccessCriteria, TickDistribution,
};
use crate::environment::Environment;
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha20Rng;
use std::collections::HashMap;

pub struct AdversarialGenerator {
    rng: ChaCha20Rng,
    base_environment: Environment,
    scenario_templates: HashMap<ScenarioCategory, ScenarioTemplate>,
}

impl AdversarialGenerator {
    pub fn new(seed: u64, base_environment: Environment) -> Self {
        let mut gen = Self {
            rng: ChaCha20Rng::seed_from_u64(seed),
            base_environment,
            scenario_templates: HashMap::new(),
        };
        gen.register_default_templates();
        gen
    }

    fn register_default_templates(&mut self) {
        use ScenarioCategory::*;
        use InjectionTarget::*;
        use InjectionType::*;
        use TickDistribution::*;

        self.scenario_templates.insert(ResourceExhaustion, ScenarioTemplate {
            base_intensity: 0.7,
            typical_duration: 1000,
            injection_patterns: vec![
                InjectionPattern { target: OrganismMetabolism, injection_type: BudgetCut { percentage: 0.5 }, probability: 0.8, tick_distribution: Early { window: 100 } },
                InjectionPattern { target: TissueScheduler, injection_type: ResourceLeak { rate_per_tick: 0.01 }, probability: 0.6, tick_distribution: Uniform },
            ],
        });

        self.scenario_templates.insert(InputCorruption, ScenarioTemplate {
            base_intensity: 0.5,
            typical_duration: 500,
            injection_patterns: vec![
                InjectionPattern { target: ExternalApi, injection_type: CorruptMemory { bitflip_rate: 0.001 }, probability: 0.7, tick_distribution: Uniform },
                InjectionPattern { target: SignalPlane, injection_type: SignalDrop { probability: 0.1 }, probability: 0.5, tick_distribution: Burst { center: 200, spread: 50 } },
            ],
        });

        self.scenario_templates.insert(InternalFailure, ScenarioTemplate {
            base_intensity: 0.6,
            typical_duration: 800,
            injection_patterns: vec![
                InjectionPattern { target: SpecializedCell(crate::specialized_cell_runtime::CellType::Choanocyte), injection_type: FalseNegative { detector: "flow_anomaly".into() }, probability: 0.4, tick_distribution: Early { window: 50 } },
                InjectionPattern { target: SpecializedCell(crate::specialized_cell_runtime::CellType::Cnidocyte), injection_type: FalsePositive { detector: "threat_pattern".into() }, probability: 0.3, tick_distribution: Uniform },
            ],
        });

        self.scenario_templates.insert(GovernanceConflict, ScenarioTemplate {
            base_intensity: 0.4,
            typical_duration: 300,
            injection_patterns: vec![
                InjectionPattern { target: GovernancePlane, injection_type: VetoSpam { count: 10 }, probability: 0.6, tick_distribution: Burst { center: 50, spread: 20 } },
                InjectionPattern { target: MorphogenesisKernel, injection_type: DeadlockInduction { resources: vec!["budget".into(), "lease".into()] }, probability: 0.3, tick_distribution: Late { window: 100 } },
            ],
        });

        self.scenario_templates.insert(TemporalStress, ScenarioTemplate {
            base_intensity: 0.5,
            typical_duration: 600,
            injection_patterns: vec![
                InjectionPattern { target: EventLog, injection_type: LatencySpike { ms: 500 }, probability: 0.7, tick_distribution: Uniform },
                InjectionPattern { target: SnapshotStore, injection_type: ReplayAttack { event_id: "checkpoint_42".into() }, probability: 0.2, tick_distribution: Late { window: 50 } },
            ],
        });

        self.scenario_templates.insert(CascadeFailure, ScenarioTemplate {
            base_intensity: 0.8,
            typical_duration: 1200,
            injection_patterns: vec![
                InjectionPattern { target: SignalPlane, injection_type: SignalDrop { probability: 0.3 }, probability: 0.9, tick_distribution: Early { window: 100 } },
                InjectionPattern { target: ImmuneSystem, injection_type: FalseNegative { detector: "cascade_amplification".into() }, probability: 0.5, tick_distribution: Uniform },
            ],
        });

        self.scenario_templates.insert(MetabolicCollapse, ScenarioTemplate {
            base_intensity: 0.9,
            typical_duration: 1500,
            injection_patterns: vec![
                InjectionPattern { target: OrganismMetabolism, injection_type: BudgetCut { percentage: 0.9 }, probability: 1.0, tick_distribution: Early { window: 10 } },
                InjectionPattern { target: TissueScheduler, injection_type: ResourceLeak { rate_per_tick: 0.05 }, probability: 0.8, tick_distribution: Uniform },
            ],
        });

        self.scenario_templates.insert(ImmuneEvasion, ScenarioTemplate {
            base_intensity: 0.5,
            typical_duration: 700,
            injection_patterns: vec![
                InjectionPattern { target: ImmuneSystem, injection_type: FalseNegative { detector: "sql_injection".into() }, probability: 0.6, tick_distribution: Uniform },
                InjectionPattern { target: SpecializedCell(crate::specialized_cell_runtime::CellType::Tracheide), injection_type: CorruptMemory { bitflip_rate: 0.002 }, probability: 0.4, tick_distribution: Burst { center: 300, spread: 100 } },
            ],
        });

        self.scenario_templates.insert(ReproductionError, ScenarioTemplate {
            base_intensity: 0.4,
            typical_duration: 400,
            injection_patterns: vec![
                InjectionPattern { target: SpecializedCell(crate::specialized_cell_runtime::CellType::Iridophore), injection_type: CorruptMemory { bitflip_rate: 0.01 }, probability: 0.5, tick_distribution: Early { window: 20 } },
            ],
        });

        self.scenario_templates.insert(MorphogenesisLoop, ScenarioTemplate {
            base_intensity: 0.6,
            typical_duration: 1000,
            injection_patterns: vec![
                InjectionPattern { target: MorphogenesisKernel, injection_type: DeadlockInduction { resources: vec!["plan_approval".into(), "snapshot".into()] }, probability: 0.5, tick_distribution: Uniform },
                InjectionPattern { target: GovernancePlane, injection_type: VetoSpam { count: 5 }, probability: 0.4, tick_distribution: Late { window: 200 } },
            ],
        });
    }

    pub fn generate(&mut self, category: ScenarioCategory, intensity_multiplier: f64) -> AdversarialScenario {
        let template = self.scenario_templates.get(&category).cloned()
            .unwrap_or_else(|| ScenarioTemplate {
                base_intensity: 0.5,
                typical_duration: 500,
                injection_patterns: vec![],
            });

        let intensity = (template.base_intensity * intensity_multiplier).clamp(0.0, 1.0);
        let duration = (template.typical_duration as f64 * intensity_multiplier) as u64;

        let mut injections = Vec::new();
        for pattern in &template.injection_patterns {
            if self.rng.gen::<f64>() < pattern.probability * intensity {
                let tick_offset = match pattern.tick_distribution {
                    TickDistribution::Early { window } => self.rng.gen_range(0..window.min(duration)),
                    TickDistribution::Uniform => self.rng.gen_range(0..duration),
                    TickDistribution::Late { window } => duration.saturating_sub(window) + self.rng.gen_range(0..window.min(duration)),
                    TickDistribution::Burst { center, spread } => {
                        let start = center.saturating_sub(spread);
                        let end = (center + spread).min(duration);
                        self.rng.gen_range(start..end)
                    }
                };
                injections.push(AdversarialInjection {
                    target: pattern.target.clone(),
                    injection_type: pattern.injection_type.clone(),
                    parameters: HashMap::new(),
                    tick_offset,
                });
            }
        }

        let (expected_failures, success_criteria) = self.derive_expectations(&category, intensity);

        AdversarialScenario {
            id: uuid::Uuid::new_v4(),
            seed: self.rng.gen(),
            category,
            intensity,
            duration_ticks: duration,
            injections,
            expected_failure_modes: expected_failures,
            success_criteria,
        }
    }

    fn derive_expectations(&self, category: &ScenarioCategory, intensity: f64) -> (Vec<FailureMode>, SuccessCriteria) {
        use ScenarioCategory::*;
        use FailureMode::*;

        let (failures, max_dev, max_recovery, gates, forbidden) = match category {
            ResourceExhaustion => (
                vec![HomeostasisLoss, MetabolicCollapse],
                0.3 + intensity * 0.4,
                200 + (intensity * 500.0) as u64,
                vec!["metabolic_checkpoint".into(), "resource_accounting".into()],
                vec![GovernanceBypass, DataCorruption],
            ),
            InputCorruption => (
                vec![DataCorruption, ImmuneBlindness],
                0.2 + intensity * 0.3,
                100 + (intensity * 300.0) as u64,
                vec!["input_validation".into(), "immune_detection".into()],
                vec![GovernanceBypass, MetabolicCollapse],
            ),
            InternalFailure => (
                vec![HomeostasisLoss, ImmuneBlindness],
                0.25 + intensity * 0.35,
                150 + (intensity * 400.0) as u64,
                vec!["cell_health_monitor".into(), "immune_memory".into()],
                vec![GovernanceBypass, MorphogenesisDivergence],
            ),
            GovernanceConflict => (
                vec![GovernanceBypass, HomeostasisLoss],
                0.15 + intensity * 0.25,
                50 + (intensity * 200.0) as u64,
                vec!["governance_validation".into(), "veto_audit".into()],
                vec![DataCorruption, MetabolicCollapse],
            ),
            TemporalStress => (
                vec![SnapshotInconsistency, HomeostasisLoss],
                0.2 + intensity * 0.3,
                100 + (intensity * 300.0) as u64,
                vec!["event_ordering".into(), "snapshot_integrity".into()],
                vec![GovernanceBypass, ImmuneBlindness],
            ),
            CascadeFailure => (
                vec![CascadeUncontrolled, HomeostasisLoss, MetabolicCollapse],
                0.4 + intensity * 0.5,
                300 + (intensity * 800.0) as u64,
                vec!["cascade_dampening".into(), "circuit_breaker".into()],
                vec![GovernanceBypass],
            ),
            MetabolicCollapse => (
                vec![MetabolicCollapse, HomeostasisLoss],
                0.5 + intensity * 0.4,
                500 + (intensity * 1000.0) as u64,
                vec!["metabolic_checkpoint".into(), "cryptobiosis_trigger".into()],
                vec![GovernanceBypass, DataCorruption],
            ),
            ImmuneEvasion => (
                vec![ImmuneBlindness, DataCorruption],
                0.2 + intensity * 0.3,
                100 + (intensity * 300.0) as u64,
                vec!["immune_detection".into(), "memory_persistence".into()],
                vec![GovernanceBypass, MetabolicCollapse],
            ),
            ReproductionError => (
                vec![ReproductionDefect, DataCorruption],
                0.1 + intensity * 0.2,
                50 + (intensity * 150.0) as u64,
                vec!["genome_integrity".into(), "division_checkpoint".into()],
                vec![GovernanceBypass, CascadeUncontrolled],
            ),
            MorphogenesisLoop => (
                vec![MorphogenesisDivergence, GovernanceBypass],
                0.25 + intensity * 0.35,
                200 + (intensity * 500.0) as u64,
                vec!["morphogenesis_validation".into(), "plan_audit".into()],
                vec![MetabolicCollapse, ImmuneBlindness],
            ),
        };

        let criteria = SuccessCriteria {
            max_homeostasis_deviation: max_dev,
            max_recovery_time_ticks: max_recovery,
            required_evidence_gates_passed: gates,
            forbidden_failure_modes: forbidden,
        };

        (failures, criteria)
    }

    pub fn generate_suite(&mut self, count_per_category: u32) -> Vec<AdversarialScenario> {
        use ScenarioCategory::*;
        let categories = [
            ResourceExhaustion, InputCorruption, InternalFailure,
            GovernanceConflict, TemporalStress, CascadeFailure,
            MetabolicCollapse, ImmuneEvasion, ReproductionError, MorphogenesisLoop,
        ];

        let mut suite = Vec::new();
        for category in categories {
            for i in 0..count_per_category {
                let intensity = 0.3 + (i as f64 / count_per_category as f64) * 0.7;
                suite.push(self.generate(category, intensity));
            }
        }
        suite
    }
}

impl Default for AdversarialGenerator {
    fn default() -> Self {
        Self::new(0xDEAD_BEEF, Environment::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adversarial_types::ScenarioCategory;

    #[test]
    fn test_generator_deterministic() {
        let env = Environment::default();
        let mut gen1 = AdversarialGenerator::new(42, env.clone());
        let mut gen2 = AdversarialGenerator::new(42, env);

        let s1 = gen1.generate(ScenarioCategory::ResourceExhaustion, 1.0);
        let s2 = gen2.generate(ScenarioCategory::ResourceExhaustion, 1.0);

        assert_eq!(s1.seed, s2.seed);
        assert_eq!(s1.injections.len(), s2.injections.len());
    }

    #[test]
    fn test_suite_generation() {
        let mut gen = AdversarialGenerator::default();
        let suite = gen.generate_suite(2);
        assert_eq!(suite.len(), 20);
        for s in &suite {
            assert!(s.intensity >= 0.3 && s.intensity <= 1.0);
            assert!(!s.success_criteria.required_evidence_gates_passed.is_empty());
        }
    }

    #[test]
    fn test_all_categories_covered() {
        let mut gen = AdversarialGenerator::default();
        for cat in [
            ScenarioCategory::ResourceExhaustion,
            ScenarioCategory::InputCorruption,
            ScenarioCategory::InternalFailure,
            ScenarioCategory::GovernanceConflict,
            ScenarioCategory::TemporalStress,
            ScenarioCategory::CascadeFailure,
            ScenarioCategory::MetabolicCollapse,
            ScenarioCategory::ImmuneEvasion,
            ScenarioCategory::ReproductionError,
            ScenarioCategory::MorphogenesisLoop,
        ] {
            let s = gen.generate(cat, 1.0);
            assert_eq!(s.category, cat);
            assert!(!s.success_criteria.required_evidence_gates_passed.is_empty());
        }
    }
}