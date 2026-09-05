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
    }
}
