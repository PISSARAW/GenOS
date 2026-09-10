pub mod reproduction_tests;

#[cfg(test)]
mod tests {
    use crate::args::{AgentSubcommands, SnapshotSubcommands, BiomimicrySubcommands};
    use crate::commands::{agent, snapshot, biomimicry, hallucination, replay};

    #[test]
    fn test_agent_and_snapshot_lifecycle() {
        let temp_dir = std::env::temp_dir();
        let uid = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let agent_file = temp_dir.join(format!("test_agent_cell_{}.yaml", uid)).to_string_lossy().to_string();
        let snap_file = temp_dir.join(format!("test_agent_snapshot_{}.json", uid)).to_string_lossy().to_string();

        let res = agent::execute(AgentSubcommands::Create {
            name: "Kwame".to_string(),
            role: "Architecte".to_string(),
            out: agent_file.clone(),
        });
        assert!(res.is_ok());

        let res_val = agent::execute(AgentSubcommands::Validate {
            file: agent_file.clone(),
        });
        assert!(res_val.is_ok());

        let res_snap = snapshot::execute(SnapshotSubcommands::Create {
            agent: agent_file,
            out: snap_file.clone(),
        });
        assert!(res_snap.is_ok());

        let res_snap_val = snapshot::execute(SnapshotSubcommands::Validate {
            file: snap_file.clone(),
        });
        assert!(res_snap_val.is_ok());

        let res_diff = snapshot::handle_diff(&snap_file, &snap_file);
        assert!(res_diff.is_ok());

        let res_hallucination = hallucination::execute(crate::args::HallucinationSubcommands::Detect {
            snapshot: snap_file.clone(),
        });
        assert!(res_hallucination.is_ok());

        let res_replay = replay::execute(crate::args::ReplaySubcommands::Basic {
            snapshot: snap_file,
        });
        assert!(res_replay.is_ok());
    }

    #[test]
    fn test_replay_verifies_recorded_steps_and_rejects_tampering() {
        let temp_dir = std::env::temp_dir();
        let uid = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let agent_file = temp_dir.join(format!("test_replay_agent_{}.yaml", uid)).to_string_lossy().to_string();
        let snap_file = temp_dir.join(format!("test_replay_snapshot_{}.json", uid)).to_string_lossy().to_string();

        agent::execute(AgentSubcommands::Create {
            name: "Ama".to_string(),
            role: "Analyst".to_string(),
            out: agent_file.clone(),
        }).unwrap();
        snapshot::execute(SnapshotSubcommands::Create {
            agent: agent_file,
            out: snap_file.clone(),
        }).unwrap();

        snapshot::execute(SnapshotSubcommands::RecordStep {
            snapshot: snap_file.clone(),
            action: "tool_call".to_string(),
            delta_entropy: 0.1,
            delta_dissonance: 0.0,
            payload: None,
        }).unwrap();

        let ok = replay::execute(crate::args::ReplaySubcommands::Basic { snapshot: snap_file.clone() });
        assert!(ok.is_ok());

        let raw = std::fs::read_to_string(&snap_file).unwrap();
        let tampered = raw.replace("\"delta_entropy\": 0.1", "\"delta_entropy\": 9.9");
        std::fs::write(&snap_file, tampered).unwrap();
        let tampered_result = replay::execute(crate::args::ReplaySubcommands::Basic { snapshot: snap_file });
        assert!(tampered_result.is_err());
    }

    #[test]
    fn test_biomimicry_commands() {
        let res = biomimicry::execute(BiomimicrySubcommands::GlialCleanup {
            agent_id: "test-agent".to_string(),
            intensity: Some("high".to_string()),
        });
        assert!(res.is_ok());

        let res2 = biomimicry::execute(BiomimicrySubcommands::StigmergyDeposit {
            agent_id: "test-agent".to_string(),
            target_file: "main.rs".to_string(),
            pheromone_type: "trail".to_string(),
            amount: 2.5,
            is_repellent: false,
        });
        assert!(res2.is_ok());

        let res_read = biomimicry::execute(BiomimicrySubcommands::StigmergyRead {
            agent_id: "test-agent".to_string(),
            target_file: "main.rs".to_string(),
        });
        assert!(res_read.is_ok());

        let res_evap = biomimicry::execute(BiomimicrySubcommands::StigmergyEvaporate {
            agent_id: "test-agent".to_string(),
            dt_seconds: Some(10.0),
        });
        assert!(res_evap.is_ok());

        let res_spore = biomimicry::execute(BiomimicrySubcommands::Spore {
            action: "create".to_string(),
            agent_id: "griot-01".to_string(),
            spore_type: Some("bacterial".to_string()),
            warm_and_wet: None,
            nutrients: None,
        });
        assert!(res_spore.is_ok());

        let res_spore_germ = biomimicry::execute(BiomimicrySubcommands::Spore {
            action: "germinate".to_string(),
            agent_id: "griot-01".to_string(),
            spore_type: Some("bacterial".to_string()),
            warm_and_wet: Some(true),
            nutrients: Some(true),
        });
        assert!(res_spore_germ.is_ok());

        let res_lum = biomimicry::execute(BiomimicrySubcommands::Bioluminescence {
            agent_id: "griot-01".to_string(),
            color: "blue".to_string(),
            organelle: "cilia".to_string(),
            event_type: "SIGNAL".to_string(),
            details: "Signal test".to_string(),
        });
        assert!(res_lum.is_ok());

        let res_anti = biomimicry::execute(BiomimicrySubcommands::AntiCollusion {
            agent_id: "griot-01".to_string(),
            consumed_tokens: 600,
            physical_test_passed: true,
        });
        assert!(res_anti.is_ok());

        let res_red = biomimicry::execute(BiomimicrySubcommands::Redundancy {
            expected_tool: "search_web".to_string(),
            mutated_tool: "searhc_web".to_string(),
            fallback: false,
        });
        assert!(res_red.is_ok());

        let res_tissue = biomimicry::execute(BiomimicrySubcommands::Tissue {
            action: "create".to_string(),
            name: "Research_Organ".to_string(),
            role: Some("Research".to_string()),
            stem_id: None,
            worker_id: None,
            task: None,
        });
        assert!(res_tissue.is_ok());

        let res_embryo = biomimicry::execute(BiomimicrySubcommands::Embryology {
            action: None,
            divisions: 2,
            gradient: 1.0,
        });
        assert!(res_embryo.is_ok());

        let res_cerebellum_1 = biomimicry::execute(BiomimicrySubcommands::CerebellumCoprocessor {
            agent_id: "agent_purkinje_test".to_string(),
            target_value: 100.0,
            expected_latency: 50.0,
            current_value: 80.0,
            actual_latency: 60.0,
        });
        assert!(res_cerebellum_1.is_ok());

        let res_cerebellum_2 = biomimicry::execute(BiomimicrySubcommands::CerebellumCoprocessor {
            agent_id: "agent_purkinje_test".to_string(),
            target_value: 100.0,
            expected_latency: 50.0,
            current_value: 99.95,
            actual_latency: 50.0,
        });
        assert!(res_cerebellum_2.is_ok());
    }
}
