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
        assert!(res_replay.is_err());
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

    #[test]
    fn test_reproduction_commands() {
        use crate::args::EvolutionSubcommands;
        use crate::commands::reproduction;

        // 1. Meiotic Crossover (Uniform & Single Point)
        let res_cross = reproduction::execute(EvolutionSubcommands::Crossover {
            parent_a: "AGENT_ALPHA_ARCHITECT".to_string(),
            parent_b: "AGENT_BETA_FALSIFIER".to_string(),
            swap_prob: 0.5,
            crossover_point: None,
            seed: Some("test-seed".to_string()),
        });
        assert!(res_cross.is_ok());

        let res_cross_pt = reproduction::execute(EvolutionSubcommands::Crossover {
            parent_a: "AGENT_ALPHA_ARCHITECT".to_string(),
            parent_b: "AGENT_BETA_FALSIFIER".to_string(),
            swap_prob: 0.5,
            crossover_point: Some(10),
            seed: Some("test-seed".to_string()),
        });
        assert!(res_cross_pt.is_ok());

        // 2. Cell Division (Mitosis, Binary Fission, Budding, Schizogony)
        let res_mitosis = reproduction::execute(EvolutionSubcommands::Division {
            agent_id: "agent_mitosis_01".to_string(),
            mode: "mitosis".to_string(),
            mutation_rate: 0.0,
            daughter_volume: 0.5,
            merozoite_count: 2,
            seed: Some("test-seed".to_string()),
        });
        assert!(res_mitosis.is_ok());

        let res_fission = reproduction::execute(EvolutionSubcommands::Division {
            agent_id: "agent_fission_01".to_string(),
            mode: "binary_fission".to_string(),
            mutation_rate: 0.05,
            daughter_volume: 0.5,
            merozoite_count: 2,
            seed: Some("test-seed".to_string()),
        });
        assert!(res_fission.is_ok());

        // 3. Phylogeny (Divergence, Hybridization, Molecular Clock, Tree)
        let res_div = reproduction::execute(EvolutionSubcommands::Phylogeny {
            action: "divergence".to_string(),
            genome_a: "HOMO_SAPIENS_CORE".to_string(),
            genome_b: Some("PAN_TROGLODYTES_CORE".to_string()),
            mutation_rate: 0.01,
            is_plant: false,
        });
        assert!(res_div.is_ok());

        let res_hyb = reproduction::execute(EvolutionSubcommands::Phylogeny {
            action: "hybridize".to_string(),
            genome_a: "HOMO_SAPIENS_CORE".to_string(),
            genome_b: Some("HOMO_NEANDERTHALENSIS".to_string()),
            mutation_rate: 0.01,
            is_plant: false,
        });
        assert!(res_hyb.is_ok());

        let res_clock = reproduction::execute(EvolutionSubcommands::Phylogeny {
            action: "molecular_clock".to_string(),
            genome_a: "LINEAGE_A".to_string(),
            genome_b: Some("LINEAGE_B".to_string()),
            mutation_rate: 0.02,
            is_plant: false,
        });
        assert!(res_clock.is_ok());

        let res_tree = reproduction::execute(EvolutionSubcommands::Phylogeny {
            action: "tree".to_string(),
            genome_a: "GENOS_SWARM_ALPHA".to_string(),
            genome_b: None,
            mutation_rate: 0.01,
            is_plant: false,
        });
        assert!(res_tree.is_ok());
    }

    #[test]
    fn test_store_commands() {
        use crate::commands::{capsule, store_ops};
        use crate::args::CapsuleSubcommands;

        // 1. Cryptobiosis freeze, status, thaw
        let freeze_res = store_ops::handle_cryptobiosis("test_tardigrade", Some("freeze"), Some(r#"{"health": 100}"#));
        assert!(freeze_res.is_ok());

        let status_res = store_ops::handle_cryptobiosis("test_tardigrade", Some("status"), None);
        assert!(status_res.is_ok());

        let thaw_res = store_ops::handle_cryptobiosis("test_tardigrade", Some("thaw"), None);
        assert!(thaw_res.is_ok());

        // 2. Stratigraphic Fossils record and list
        let fossil_res = store_ops::handle_fossil_record("lineage_ammonite", "Permian-Triassic extinction event");
        assert!(fossil_res.is_ok());

        let list_res = store_ops::handle_fossil_list();
        assert!(list_res.is_ok());

        // 3. Capsule creation with SHA-256 integrity and audit
        let cap_res = capsule::execute(CapsuleSubcommands::Create {
            snapshot: r#"{"state":"immutable","epoch":1}"#.to_string(),
            seed: Some("seed_alpha".to_string()),
            budget_steps: Some(50),
        });
        assert!(cap_res.is_ok());

        let audit_res = capsule::handle_audit("snap_test_101", None);
        assert!(audit_res.is_ok());
    }
}
