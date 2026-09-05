#[cfg(test)]
mod tests {
    use crate::args::{AgentSubcommands, SnapshotSubcommands, BiomimicrySubcommands};
    use crate::commands::{agent, snapshot, biomimicry, hallucination, replay};

    #[test]
    fn test_agent_and_snapshot_lifecycle() {
        let temp_dir = std::env::temp_dir();
        let agent_file = temp_dir.join("test_agent_cell.yaml").to_string_lossy().to_string();
        let snap_file = temp_dir.join("test_agent_snapshot.json").to_string_lossy().to_string();

        let res = agent::execute(AgentSubcommands::Create {
            name: "Kwame".to_string(),
            role: "Architecte".to_string(),
            out: agent_file.clone(),
        });
        assert!(res.is_ok());

        let res_snap = snapshot::execute(SnapshotSubcommands::Create {
            agent: agent_file,
            out: snap_file.clone(),
        });
        assert!(res_snap.is_ok());

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
        });
        assert!(res2.is_ok());

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
    }
}
