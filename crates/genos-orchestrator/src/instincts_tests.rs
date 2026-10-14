use super::*;

    struct RecordingExecutor {
        calls: usize,
    }

    impl InstinctActionExecutor for RecordingExecutor {
        fn execute(&mut self, step: &MotorStep) -> Result<InstinctActionReceipt, String> {
            self.calls += 1;
            Ok(InstinctActionReceipt {
                execution_id: format!("exec-{}", self.calls),
                evidence_ref: format!("evidence:{}", step.action),
                result: json!({ "action": step.action, "accepted": true }),
            })
        }
    }

    struct ThreatSensor;

    impl InstinctSensorAdapter for ThreatSensor {
        fn read(&mut self) -> Result<Vec<SignStimulus>, String> {
            Ok(vec![SignStimulus::new(Modality::Error, "threat_detected", 0.9)
            ])
        }
    }

    #[test]
    fn threat_state_emits_sign_stimulus() {
        let state = WorldState {
            threat: 0.8,
            ..WorldState::default()
        };
        let field = stimulus_field_from(&state);
        assert!(
            field
                .readings
                .iter()
                .any(|s| s.signature == "threat_detected")
        );
    }

    #[test]
    fn budget_pressure_emits_resource_stimulus() {
        let state = WorldState {
            budget_pressure: 0.9,
            ..WorldState::default()
        };
        let field = stimulus_field_from(&state);
        assert!(
            field
                .readings
                .iter()
                .any(|s| s.signature == "resource_exhausted")
        );
    }

    #[test]
    fn runtime_without_action_permissions_vetoes_dispatch() {
        let mut eco = GenosEcosystem::new("Instinct_Unit");
        let state = WorldState {
            threat: 0.9,
            ..WorldState::default()
        };
        eco.run_instincts(&state);
        assert_eq!(eco.last_instincts().len(), 1);
        assert!(matches!(
            eco.last_instincts()[0].outcome,
            InstinctOutcome::Interrupt { .. }
        ));
    }

    #[test]
    fn mission_threat_runs_authorized_paf_and_records_action_evidence() {
        let mut eco = GenosEcosystem::new("PAF_Runtime");
        eco.set_instinct_authorized_tools(vec!["genos_biomimicry".to_string()]);
        eco.set_instinct_action_executor(Box::new(RecordingExecutor { calls: 0 }));
        eco.run_instincts(&WorldState { threat: 0.9, ..WorldState::default() });

        assert!(matches!(eco.last_instincts()[0].outcome, InstinctOutcome::Complete { steps_executed: 2, .. }));
        let events = eco.events.read_stream(1);
        assert!(events.iter().any(|event| event.event_type == "INSTINCT_TRIGGER"));
        assert_eq!(events.iter().filter(|event| event.event_type == "INSTINCT_ACTION_EXECUTED").count(), 2);
        assert!(events.iter().any(|event| event.payload["result"]["evidence_ref"].as_str().unwrap_or("").starts_with("evidence:")));
    }

    #[test]
    fn mission_tick_persists_instinct_stimulus_decision_and_action_receipts() {
        use crate::planner::Goal;
        use genos_store::BiologicalReceiptStore;

        let path = std::env::temp_dir().join(format!("genos-instinct-{}.jsonl", Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mut eco = GenosEcosystem::new("PAF_Durable");
        let mission_id = Uuid::new_v4();
        eco.set_mission_id(mission_id);
        eco.seed_germline(eco.orchestrator.orchestrator_id, "PAF_DURABLE_ROOT")
            .unwrap();
        eco.set_instinct_authorized_tools(vec!["genos_biomimicry".to_string()]);
        eco.set_instinct_action_executor(Box::new(RecordingExecutor { calls: 0 }));
        eco.set_instinct_sensor_adapter(Box::new(ThreatSensor));

        eco.tick_and_persist(&Goal::Explore, &store).unwrap();

        let persisted = BiologicalReceiptStore::open(&path).read_all().unwrap();
        let receipt = persisted
            .iter()
            .find(|item| item["schema"] == "genos.instinct-paf-receipt/v1")
            .expect("tick persists a mission-bound instinct receipt");
        assert_eq!(receipt["mission_id"], mission_id.to_string());
        assert_eq!(receipt["tick"], 1);
        assert_eq!(receipt["stimuli"][0]["signature"], "threat_detected");
        assert_eq!(receipt["stimuli"][0]["provenance"]["kind"], "synthetic");
        assert_eq!(receipt["evaluation"]["released"], true);
        assert_eq!(receipt["outcome"]["Complete"]["steps_executed"], 2);
        assert_eq!(receipt["actions"].as_array().unwrap().len(), 2);
        assert_eq!(receipt["actions"][0]["result"]["evidence_ref"], "evidence:raise_alarm");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn calm_state_does_not_trigger() {
        let mut eco = GenosEcosystem::new("Calm_Unit");
        eco.run_instincts(&WorldState::default());
        assert!(matches!(
            eco.last_instincts()[0].outcome,
            InstinctOutcome::NotTriggered { .. }
        ));
    }
