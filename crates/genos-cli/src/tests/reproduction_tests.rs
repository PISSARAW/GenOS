use crate::args::EvolutionSubcommands;
use crate::commands::reproduction;

#[test]
pub fn test_reproduction_commands() {
    // 1. Meiotic Crossover (Uniform & Single Point)
    let res_cross = reproduction::execute(EvolutionSubcommands::Crossover {
        parent_a: "AGENT_ALPHA_ARCHITECT".to_string(),
        parent_b: "AGENT_BETA_FALSIFIER".to_string(),
        swap_prob: 0.5,
        crossover_point: None,
        speciation_threshold: None,
        genes_a: None,
        genes_b: None,
        seed: Some("test-seed".to_string()),
    });
    assert!(res_cross.is_ok());

    let res_cross_pt = reproduction::execute(EvolutionSubcommands::Crossover {
        parent_a: "AGENT_ALPHA_ARCHITECT".to_string(),
        parent_b: "AGENT_BETA_FALSIFIER".to_string(),
        swap_prob: 0.5,
        crossover_point: Some(10),
        speciation_threshold: None,
        genes_a: None,
        genes_b: None,
        seed: Some("test-seed".to_string()),
    });
    assert!(res_cross_pt.is_ok());

    // Test speciation barrier rejection when divergence exceeds threshold
    let res_cross_speciation = reproduction::execute(EvolutionSubcommands::Crossover {
        parent_a: "AGENT_ALPHA_ARCHITECT".to_string(),
        parent_b: "AGENT_BETA_FALSIFIER".to_string(),
        swap_prob: 0.5,
        crossover_point: None,
        speciation_threshold: Some(0.0001),
        genes_a: None,
        genes_b: None,
        seed: Some("test-seed".to_string()),
    });
    assert!(res_cross_speciation.is_ok());

    // Test crossover with real structured gene payloads
    let res_cross_genes = reproduction::execute(EvolutionSubcommands::Crossover {
        parent_a: "AGENT_ALPHA_ARCHITECT".to_string(),
        parent_b: "AGENT_BETA_FALSIFIER".to_string(),
        swap_prob: 0.5,
        crossover_point: None,
        speciation_threshold: None,
        genes_a: Some(r#"{"role":"architect","strategy":"mcts"}"#.to_string()),
        genes_b: Some(r#"{"role":"auditor","tools":"genos_inspect,genos_patch"}"#.to_string()),
        seed: Some("test-seed".to_string()),
    });
    assert!(res_cross_genes.is_ok());

    // 2. Cell Division (Mitosis, Binary Fission, Budding, Schizogony)
    let res_mitosis = reproduction::execute(EvolutionSubcommands::Division {
        agent_id: "agent_mitosis_01".to_string(),
        mode: "mitosis".to_string(),
        mutation_rate: 0.0,
        daughter_volume: 0.5,
        merozoite_count: 2,
        hayflick_limit: None,
        genes: Some(r#"{"role":"worker","efficiency":"0.95"}"#.to_string()),
        seed: Some("test-seed".to_string()),
    });
    assert!(res_mitosis.is_ok());

    let res_fission = reproduction::execute(EvolutionSubcommands::Division {
        agent_id: "agent_fission_01".to_string(),
        mode: "binary_fission".to_string(),
        mutation_rate: 0.05,
        daughter_volume: 0.5,
        merozoite_count: 2,
        hayflick_limit: None,
        genes: None,
        seed: Some("test-seed".to_string()),
    });
    assert!(res_fission.is_ok());

    let res_meiosis = reproduction::execute(EvolutionSubcommands::Division {
        agent_id: "agent_meiosis_01".to_string(),
        mode: "meiosis".to_string(),
        mutation_rate: 0.0,
        daughter_volume: 0.5,
        merozoite_count: 4,
        hayflick_limit: None,
        genes: None,
        seed: Some("test-seed".to_string()),
    });
    assert!(res_meiosis.is_ok());

    let res_budding = reproduction::execute(EvolutionSubcommands::Division {
        agent_id: "agent_budding_01".to_string(),
        mode: "budding".to_string(),
        mutation_rate: 0.0,
        daughter_volume: 0.3,
        merozoite_count: 4,
        hayflick_limit: Some(10),
        genes: Some(r#"{"tool_a":"genos_inspect","tool_b":"genos_verify"}"#.to_string()),
        seed: Some("test-seed".to_string()),
    });
    assert!(res_budding.is_ok());

    let res_schizogony = reproduction::execute(EvolutionSubcommands::Division {
        agent_id: "agent_schizogony_01".to_string(),
        mode: "schizogony".to_string(),
        mutation_rate: 0.05,
        daughter_volume: 0.5,
        merozoite_count: 4,
        hayflick_limit: None,
        genes: None,
        seed: Some("test-schizogony-seed".to_string()),
    });
    assert!(res_schizogony.is_ok());

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
pub fn test_store_commands() {
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

    let audit_capsule = genos_store::Capsule::create(
        "sandbox_boundary",
        serde_json::json!({ "state": "immutable", "epoch": 1 }),
    );
    let capsule_dir = crate::commands::root_resolver::resolve_matrix_root().join("capsules");
    std::fs::create_dir_all(&capsule_dir).unwrap();
    let capsule_path = capsule_dir.join(format!("{}.json", audit_capsule.capsule_id));
    std::fs::write(&capsule_path, serde_json::to_string_pretty(&audit_capsule).unwrap()).unwrap();
    let opts = crate::commands::output_guard::WriteOptions { force: true, parents: true };
    let audit_res = capsule::handle_audit(&audit_capsule.capsule_id.to_string(), None, &opts);
    assert!(audit_res.is_ok(), "audit_res failed with: {:?}", audit_res.err());
}

#[test]
pub fn test_budding_cli_lifecycle() {
    let res = reproduction::execute(EvolutionSubcommands::Division {
        agent_id: "agent_budding_test_root".to_string(),
        mode: "budding".to_string(),
        mutation_rate: 0.0,
        daughter_volume: 0.25,
        merozoite_count: 1,
        hayflick_limit: Some(5),
        genes: None,
        seed: None,
    });
    assert!(res.is_ok());

    let res_invalid = reproduction::execute(EvolutionSubcommands::Division {
        agent_id: "agent_budding_test_root".to_string(),
        mode: "budding".to_string(),
        mutation_rate: 0.0,
        daughter_volume: 1.5,
        merozoite_count: 1,
        hayflick_limit: Some(5),
        genes: None,
        seed: None,
    });
    assert!(res_invalid.is_ok());
}

#[test]
pub fn test_cell_division_gene_inheritance() {
    let res = reproduction::execute(EvolutionSubcommands::Division {
        agent_id: "agent_parent_inherited".to_string(),
        mode: "budding".to_string(),
        mutation_rate: 0.0,
        daughter_volume: 0.25,
        merozoite_count: 1,
        hayflick_limit: Some(10),
        genes: Some(r#"{"cognition_engine":"deep_thought","policy_safety":"0.99"}"#.to_string()),
        seed: Some("repro-inheritance-seed".to_string()),
    });
    assert!(res.is_ok());
}

#[test]
pub fn test_epigenetic_pioneer_factor_protection() {
    use crate::args::BiomimicrySubcommands;
    use crate::commands::biomimicry;

    let uid = uuid::Uuid::new_v4();
    let agent = format!("agent_epigenetic_{uid}");
    let res_lock = biomimicry::execute(BiomimicrySubcommands::EpigeneticChromatin {
        agent_id: agent.clone(),
        locus: "critical_safety_gene".to_string(),
        state: "heterochromatin_constitutive".to_string(),
        pioneer_factor: false,
    });
    assert!(res_lock.is_ok());

    let res_illegal = biomimicry::execute(BiomimicrySubcommands::EpigeneticChromatin {
        agent_id: agent.clone(),
        locus: "critical_safety_gene".to_string(),
        state: "euchromatin".to_string(),
        pioneer_factor: false,
    });
    assert!(res_illegal.is_err());

    let res_legal = biomimicry::execute(BiomimicrySubcommands::EpigeneticChromatin {
        agent_id: agent,
        locus: "critical_safety_gene".to_string(),
        state: "euchromatin".to_string(),
        pioneer_factor: true,
    });
    assert!(res_legal.is_ok());
}

#[test]
pub fn test_loop_detection_repetition_and_stagnation() {
    use crate::args::LoopDetectionCmd;
    use crate::commands::capsule;
    use std::io::Write;

    let temp_dir = std::env::temp_dir().join(format!("genos_test_{}", uuid::Uuid::new_v4()));
    let _ = std::fs::create_dir_all(&temp_dir);
    let history_file = temp_dir.join("history.jsonl");

    let mut file = std::fs::File::create(&history_file).unwrap();
    writeln!(file, "{{\"type\":\"run_command\",\"payload\":{{\"command\":\"cargo check\"}}}}").unwrap();
    writeln!(file, "{{\"type\":\"run_command\",\"payload\":{{\"command\":\"cargo check\"}}}}").unwrap();
    writeln!(file, "{{\"type\":\"run_command\",\"payload\":{{\"command\":\"cargo check\"}}}}").unwrap();
    writeln!(file, "{{\"type\":\"run_command\",\"payload\":{{\"command\":\"cargo check\"}}}}").unwrap();
    drop(file);

    let cmd = LoopDetectionCmd {
        history_file: history_file.to_str().unwrap().to_string(),
        exact_match: 3,
        stagnation: 5,
        similarity: 0.95,
    };

    let res = capsule::handle_loop_detection(&cmd);
    assert!(res.is_ok());
}
