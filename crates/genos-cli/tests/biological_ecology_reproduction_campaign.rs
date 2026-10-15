use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use uuid::Uuid;

const CAMPAIGN_SEED: u64 = 41;
const CAMPAIGN_BUDGET_TICKS: u64 = 3;

struct CampaignContext {
    root: PathBuf,
    mission_id: Uuid,
    seed: u64,
}

struct CampaignEvidence {
    reproduction: Value,
    crossover: Value,
    artifact_path: PathBuf,
}

struct EcologySeed {
    population: Value,
    spore_genome: String,
    spore_lineage: String,
}

#[test]
fn same_initial_state_and_seed_reproduce_identical_lineage_after_cli_restarts() {
    let mission_id = Uuid::new_v4();
    let initial_snapshot = seed_ecology_snapshot(mission_id);
    let first_context = campaign_context(mission_id, CAMPAIGN_SEED, "attempt-a");
    let second_context = campaign_context(mission_id, CAMPAIGN_SEED, "attempt-b");
    let first = run_campaign(&first_context, &initial_snapshot);
    let second = run_campaign(&second_context, &initial_snapshot);
    assert_eq!(first.reproduction, second.reproduction, "same initial state and campaign seed must produce the same daughter IDs and genome");
    assert_eq!(first.crossover, second.crossover, "same parents and seed must produce the same crossover result");
    assert!(first.artifact_path.exists());
    assert!(second.artifact_path.exists());

    let distinct_seed_context = campaign_context(mission_id, CAMPAIGN_SEED + 1, "distinct-seed");
    let distinct_seed = run_campaign(&distinct_seed_context, &initial_snapshot);
    assert_ne!(
        first.reproduction["daughter_cell"]["cell_id"],
        distinct_seed.reproduction["daughter_cell"]["cell_id"],
        "distinct campaign seeds must produce distinct daughter cell identities after CLI restarts",
    );
    assert_ne!(
        first.reproduction["daughter_genome"]["genome_id"],
        distinct_seed.reproduction["daughter_genome"]["genome_id"],
        "distinct campaign seeds must produce distinct daughter genome identities after CLI restarts",
    );
    assert_ne!(first.crossover, distinct_seed.crossover, "distinct seeds must produce distinct crossover receipts after CLI restarts");
    assert!(distinct_seed.artifact_path.exists());
}

fn run_campaign(
    context: &CampaignContext,
    initial: &EcologySeed,
) -> CampaignEvidence {
    std::fs::create_dir_all(&context.root).unwrap();
    let journal_dir = context.root.join("biological-receipts");
    std::fs::create_dir_all(&journal_dir).unwrap();
    let journal = journal_dir.join(format!("{}.jsonl", context.mission_id));
    BiologicalReceiptStore::open(&journal).append_receipts(&[initial.population.clone()]).unwrap();

    let first = run_tick(context, &["--reproduce"]);
    assert_cli_success(&first, "first tick and reproduction");
    let first_json = parse_cli_json(&first);
    assert_eq!(first_json["tick"], 1);
    let reproduction = receipt(&first_json, "genos.reproduction-lineage-receipt/v1");
    let daughter_id = reproduction["daughter_cell"]["cell_id"].as_str().unwrap();
    let daughter_genome_id = reproduction["daughter_genome"]["genome_id"].as_str().unwrap();
    let first_population = receipt(&first_json, "genos.population-state/v1");
    assert_spore(first_population, &initial.spore_genome, &initial.spore_lineage);

    let journal_before_wrong_seed = std::fs::read(&journal).unwrap();
    let wrong_seed = run_tick_with_seed(context, context.seed + 1, &[]);
    assert!(!wrong_seed.status.success(), "mission must refuse a seed change on restart");
    assert_eq!(std::fs::read(&journal).unwrap(), journal_before_wrong_seed, "seed mismatch must fail before journal mutation");

    let second = run_tick(context, &[]);
    assert_cli_success(&second, "restart and spore restoration");
    let second_json = parse_cli_json(&second);
    assert_eq!(second_json["tick"], 2);
    let second_population = receipt(&second_json, "genos.population-state/v1");
    assert_spore(second_population, &initial.spore_genome, &initial.spore_lineage);
    assert!(second_population["active_cells"].as_array().unwrap().iter().any(|cell| {
        cell["cell_id"] == daughter_id && cell["genome_id"] == daughter_genome_id
    }), "reproduction lineage must survive the next CLI process");

    let parent_ids = two_active_genome_cells(second_population);
    let third = run_tick_with_crossover(context, &parent_ids);
    assert_cli_success(&third, "seeded crossover after restart");
    let third_json = parse_cli_json(&third);
    assert_eq!(third_json["tick"], 3);
    let crossover = &receipt(&third_json, "genos.mission-crossover-receipt/v1")["receipt"];
    assert_eq!(crossover["seed"], context.seed);
    assert_spore(receipt(&third_json, "genos.population-state/v1"), &initial.spore_genome, &initial.spore_lineage);

    let journal_bytes = std::fs::read(&journal).unwrap();
    let journal_sha256 = digest(&journal_bytes);
    let invocations = campaign_invocations(context, &parent_ids);
    let artifact = json!({
        "schema": "genos.biological-campaign-artifact/v1",
        "scope": "synthetic runtime evidence; not biological evidence",
        "mission_id": context.mission_id,
        "seed": { "campaign": context.seed, "crossover": context.seed },
        "budget": { "max_cli_ticks": CAMPAIGN_BUDGET_TICKS },
        "invocations": invocations,
        "ticks": [first_json, second_json, third_json],
        "reproduction": reproduction,
        "spore": { "genome_id": initial.spore_genome, "lineage_id": initial.spore_lineage },
        "crossover_seed": crossover["seed"],
        "journal": {
            "path": format!("biological-receipts/{}.jsonl", context.mission_id),
            "sha256": journal_sha256,
            "bytes": journal_bytes.len()
        }
    });
    let artifact_path = context.root.join("campaign.json");
    std::fs::write(&artifact_path, serde_json::to_vec_pretty(&artifact).unwrap()).unwrap();
    verify_campaign_artifact(&artifact_path, &journal, &context.mission_id);
    CampaignEvidence {
        reproduction: serde_json::to_value(reproduction).unwrap(),
        crossover: crossover.clone(),
        artifact_path,
    }
}

fn campaign_context(mission_id: Uuid, seed: u64, label: &str) -> CampaignContext {
    let target_dir = Path::new(env!("CARGO_MANIFEST_DIR")).ancestors().nth(2).unwrap().join("target");
    let root = target_dir.join("biological-campaigns").join(format!("seed-{seed}"))
        .join(mission_id.to_string()).join(label);
    CampaignContext { root, mission_id, seed }
}

fn seed_ecology_snapshot(mission_id: Uuid) -> EcologySeed {
    let mut ecosystem = GenosEcosystem::new("fixed campaign seed");
    ecosystem.set_mission_id(mission_id);
    let founder = ecosystem.orchestrator.orchestrator_id;
    ecosystem.seed_germline(founder, "fixed campaign seed").unwrap();
    ecosystem.feed(1_000.0);
    ecosystem.orchestrator.create_tissue("Archive", "dormant campaign lineage").unwrap();
    let spore_cell = ecosystem.orchestrator.add_worker(
        "Archive",
        AgentCell::new("Dormant", "spore campaign lineage", "Soma"),
    ).unwrap();
    let genome_id = ecosystem.seed_germline(spore_cell, "campaign spore genome").unwrap();
    let lineage_id = ecosystem.orchestrator.genomes[&genome_id].lineage_id();
    ecosystem.orchestrator.sporulate_cell(spore_cell, SporeType::BacterialEndospore).unwrap();
    EcologySeed {
        population: ecosystem.population_state_receipt(0).unwrap(),
        spore_genome: genome_id.to_string(),
        spore_lineage: lineage_id.to_string(),
    }
}

fn run_tick(context: &CampaignContext, operation_args: &[&str]) -> Output {
    run_tick_with_seed(context, context.seed, operation_args)
}

fn run_tick_with_seed(context: &CampaignContext, seed: u64, operation_args: &[&str]) -> Output {
    let mission_arg = context.mission_id.to_string();
    let seed_arg = seed.to_string();
    let mut args = vec!["biological", "--tick", "--mission-id", &mission_arg, "--mission", "fixed ecology campaign", "--reproduction-seed", &seed_arg];
    args.extend_from_slice(operation_args);
    cli_command(&context.root, &args)
}

fn run_tick_with_crossover(context: &CampaignContext, parents: &[String]) -> Output {
    let mission_arg = context.mission_id.to_string();
    let seed = context.seed.to_string();
    let reproduction_seed = context.seed.to_string();
    let args = [
        "biological", "--tick", "--mission-id", &mission_arg, "--mission", "fixed ecology campaign",
        "--reproduction-seed", &reproduction_seed, "--crossover-parent-a", &parents[0], "--crossover-parent-b", &parents[1], "--crossover-seed", &seed,
    ];
    cli_command(&context.root, &args)
}

fn campaign_invocations(context: &CampaignContext, parents: &[String]) -> Vec<String> {
    vec![
        format!("genos biological --tick --mission-id {} --mission \"fixed ecology campaign\" --reproduction-seed {} --reproduce", context.mission_id, context.seed),
        format!("genos biological --tick --mission-id {} --mission \"fixed ecology campaign\" --reproduction-seed {}", context.mission_id, context.seed),
        format!("genos biological --tick --mission-id {} --mission \"fixed ecology campaign\" --reproduction-seed {} --crossover-parent-a {} --crossover-parent-b {} --crossover-seed {}", context.mission_id, context.seed, parents[0], parents[1], context.seed),
    ]
}

fn cli_command(root: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(args).env("GENOS_STUDIO_ROOT", root).output().unwrap()
}

fn assert_cli_success(output: &Output, phase: &str) {
    assert!(output.status.success(), "{phase} failed: {}", String::from_utf8_lossy(&output.stderr));
}

fn parse_cli_json(output: &Output) -> Value {
    serde_json::from_slice(&output.stdout).expect("CLI must return a JSON receipt batch")
}

fn receipt<'a>(response: &'a Value, schema: &str) -> &'a Value {
    response["receipts"].as_array().unwrap().iter()
        .find(|entry| entry["schema"] == schema || entry["receipt"]["schema"] == schema)
        .unwrap_or_else(|| panic!("missing {schema} in CLI receipt batch"))
}

fn assert_spore(population: &Value, genome_id: &str, lineage_id: &str) {
    assert!(population["tissues"]["Archive"].is_object(), "tissue state must survive campaign restarts");
    assert!(population["dormant_spores"].as_array().unwrap().iter().any(|spore| {
        spore["genome_id"] == genome_id
            && spore["lineage_id"] == lineage_id
            && spore["spore_type"] == "BacterialEndospore"
            && spore["tissue"] == "Archive"
    }), "dormant spore identity must survive campaign restarts");
}

fn two_active_genome_cells(population: &Value) -> Vec<String> {
    let mut ids = population["active_cells"].as_array().unwrap().iter()
        .filter(|cell| !cell["genome_id"].is_null())
        .map(|cell| cell["cell_id"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    ids.sort();
    ids.truncate(2);
    ids
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn verify_campaign_artifact(path: &Path, journal: &Path, mission_id: &Uuid) {
    let artifact: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    let journal_bytes = std::fs::read(journal).unwrap();
    assert_eq!(artifact["mission_id"], mission_id.to_string());
    assert_eq!(artifact["budget"]["max_cli_ticks"], CAMPAIGN_BUDGET_TICKS);
    assert_eq!(artifact["journal"]["sha256"], digest(&journal_bytes));
    assert_eq!(artifact["journal"]["bytes"], journal_bytes.len());
    assert_eq!(artifact["ticks"].as_array().unwrap().len() as u64, CAMPAIGN_BUDGET_TICKS);
    assert_eq!(artifact["invocations"].as_array().unwrap().len() as u64, CAMPAIGN_BUDGET_TICKS);
    assert!(artifact["seed"]["campaign"].as_u64().is_some());
    let crossover_seed = artifact["seed"]["crossover"].as_u64().unwrap().to_string();
    assert!(artifact["invocations"][2].as_str().unwrap()
        .contains(&format!("--crossover-seed {crossover_seed}")));
}
