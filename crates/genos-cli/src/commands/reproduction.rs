use crate::args::EvolutionSubcommands;
use crate::commands::biomimicry_ops::print_json;
use genos_genome::{Gene, Genome, Plasmid};
use genos_reproduction::{MeioticCrossover, PhylogeneticTree};
use serde_json::json;

pub fn execute(cmd: EvolutionSubcommands) -> Result<(), String> {
    match cmd {
        EvolutionSubcommands::AssimilatePlasmid {
            agent_id,
            source_agent_id,
            plasmid_name,
            plasmid_code,
        } => {
            handle_assimilate_plasmid(agent_id, source_agent_id, (plasmid_name, plasmid_code))?;
        }
        EvolutionSubcommands::Crossover {
            parent_a,
            parent_b,
            swap_prob,
            crossover_point,
            speciation_threshold,
            genes_a,
            genes_b,
            seed,
        } => {
            handle_crossover(CrossoverArgs {
                parent_a: &parent_a,
                parent_b: &parent_b,
                swap_prob,
                crossover_point,
                speciation_threshold,
                genes_a: genes_a.as_deref(),
                genes_b: genes_b.as_deref(),
                seed: seed.as_deref(),
            });
        }
        EvolutionSubcommands::Division {
            agent_id,
            mode,
            mutation_rate,
            daughter_volume,
            merozoite_count,
            hayflick_limit,
            genes,
            seed,
        } => {
            crate::commands::reproduction_division::handle_division(
                crate::commands::reproduction_division::DivisionArgs {
                    agent_id: &agent_id,
                    mode: &mode,
                    mutation_rate,
                    daughter_volume,
                    merozoite_count,
                    hayflick_limit,
                    genes: genes.as_deref(),
                    seed: seed.as_deref(),
                },
            );
        }
        EvolutionSubcommands::Phylogeny {
            action,
            genome_a,
            genome_b,
            mutation_rate,
            is_plant,
        } => {
            crate::commands::reproduction_division::handle_phylogeny(
                crate::commands::reproduction_division::PhylogenyArgs {
                    action: &action,
                    genome_a: &genome_a,
                    genome_b: genome_b.as_deref(),
                    mutation_rate,
                    is_plant,
                },
            );
        }
    }
    Ok(())
}

struct CrossoverArgs<'a> {
    parent_a: &'a str,
    parent_b: &'a str,
    swap_prob: f64,
    crossover_point: Option<usize>,
    speciation_threshold: Option<f64>,
    genes_a: Option<&'a str>,
    genes_b: Option<&'a str>,
    seed: Option<&'a str>,
}

fn handle_assimilate_plasmid(
    agent_id: Option<String>,
    source_agent_id: Option<String>,
    plasmid_info: (Option<String>, Option<String>),
) -> Result<(), String> {
    let (plasmid_name, plasmid_code) = plasmid_info;
    let target = agent_id.ok_or_else(|| "agent ID is required".to_string())?;
    let name = plasmid_name.ok_or_else(|| "plasmid ID or name is required".to_string())?;
    let instruction = plasmid_code.unwrap_or_else(|| name.clone());
    let (genome, plasmid) = persist_assimilation(
        &target,
        source_agent_id.as_deref(),
        &instruction,
    )?;

    print_json(json!({
        "success": true, "operation": "assimilate_plasmid",
        "agent_id": target, "source_agent_id": source_agent_id,
        "plasmid_name": name, "plasmid_code": plasmid.instruction, "plasmid_id": plasmid.id.to_string(),
        "persisted": true,
        "plasmids_count": genome.plasmids.len(),
        "status": "assimilated"
    }));
    Ok(())
}

fn persist_assimilation(
    target: &str,
    source: Option<&str>,
    instruction: &str,
) -> Result<(Genome, Plasmid), String> {
    validate_agent_id(target)?;
    validate_source_id(source)?;
    validate_instruction(instruction)?;
    let state_path = chromatin_state_path(target)?;
    let mut genome = load_agent_genome(&state_path, target)?;
    let plasmid = add_plasmid(&mut genome, instruction)?;
    persist_agent_genome(&state_path, &genome)?;
    Ok((genome, plasmid))
}

fn validate_source_id(source: Option<&str>) -> Result<(), String> {
    source.map_or(Ok(()), validate_agent_id)
}

fn validate_instruction(instruction: &str) -> Result<(), String> {
    if instruction.trim().is_empty() || instruction.len() > 16_384 {
        return Err("plasmid instruction must contain between 1 and 16384 bytes".to_string());
    }
    Ok(())
}

fn load_agent_genome(path: &std::path::Path, agent_id: &str) -> Result<Genome, String> {
    if !path.exists() {
        return Ok(Genome::new(agent_id));
    }
    let content = std::fs::read_to_string(path)
        .map_err(|error| format!("cannot read agent genome: {error}"))?;
    serde_json::from_str::<Genome>(&content)
        .map_err(|error| format!("agent genome is invalid; refusing to replace it: {error}"))
}

fn add_plasmid(genome: &mut Genome, instruction: &str) -> Result<Plasmid, String> {
    let plasmid = genome
        .plasmids
        .iter()
        .find(|stored| stored.instruction == instruction)
        .cloned()
        .unwrap_or_else(|| Plasmid::new(instruction));
    if !genome.plasmids.iter().any(|stored| stored.id == plasmid.id) {
        genome.plasmids.push(plasmid.clone());
    }
    genome
        .validate()
        .map_err(|error| format!("refusing to persist invalid genome: {error}"))?;
    Ok(plasmid)
}

fn persist_agent_genome(path: &std::path::Path, genome: &Genome) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(genome)
        .map_err(|error| format!("cannot serialize agent genome: {error}"))?;
    std::fs::write(path, serialized)
        .map_err(|error| format!("cannot persist plasmid assimilation: {error}"))
}

fn validate_agent_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err(
            "agent ID must contain only letters, digits, '_' or '-' and be at most 128 bytes"
                .to_string(),
        );
    }
    Ok(())
}

fn chromatin_state_path(agent_id: &str) -> Result<std::path::PathBuf, String> {
    let root = crate::commands::root_resolver::resolve_matrix_root();
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("cannot create matrix root: {error}"))?;
    let canonical_root = std::fs::canonicalize(&root)
        .map_err(|error| format!("cannot resolve matrix root: {error}"))?;
    let chromatin_dir = root.join("chromatin");
    std::fs::create_dir_all(&chromatin_dir)
        .map_err(|error| format!("cannot create chromatin directory: {error}"))?;
    let canonical_chromatin = std::fs::canonicalize(&chromatin_dir)
        .map_err(|error| format!("cannot resolve chromatin directory: {error}"))?;
    if canonical_chromatin.parent() != Some(canonical_root.as_path()) {
        return Err("chromatin directory resolves outside the matrix root".to_string());
    }
    let path = canonical_chromatin.join(format!("{agent_id}.json"));
    if path.exists() {
        let canonical_path = std::fs::canonicalize(&path)
            .map_err(|error| format!("cannot resolve agent genome path: {error}"))?;
        if !canonical_path.starts_with(&canonical_chromatin) {
            return Err("agent genome path resolves outside the chromatin directory".to_string());
        }
        return Ok(canonical_path);
    }
    Ok(path)
}

fn handle_crossover(args: CrossoverArgs) {
    let parent_a = args.parent_a;
    let parent_b = args.parent_b;
    let swap_prob = args.swap_prob;
    let crossover_point = args.crossover_point;
    let speciation_threshold = args.speciation_threshold;
    let genes_a = args.genes_a;
    let genes_b = args.genes_b;
    let seed = args.seed;

    let g_a = crossover_parent(parent_a, genes_a, &[("strategy", "depth_first_mcts"), ("safety_threshold", "0.95")]);
    let g_b = crossover_parent(parent_b, genes_b, &[("strategy", "pareto_adversarial"), ("memory_tier", "vector_synapse")]);

    let divergence = PhylogeneticTree::estimate_divergence_time(&g_a, &g_b);
    let threshold =
        speciation_threshold.unwrap_or(genos_reproduction::phylogeny::MAX_DIVERGENCE_INTROGRESSION);
    if !threshold.is_finite() || threshold < 0.0 {
        print_json(json!({
            "success": false,
            "operation": "meiotic_crossover",
            "error": "speciation threshold must be a finite non-negative number",
            "status": "invalid_speciation_threshold"
        }));
        return;
    }
    if divergence > threshold {
        print_json(json!({
            "success": false,
            "operation": "meiotic_crossover",
            "error": format!("Speciation barrier exceeded: phylogenetic divergence ({:.2} My) > threshold ({:.2} My)", divergence, threshold),
            "parent_a": parent_a,
            "parent_b": parent_b,
            "phylogenetic_divergence_mya": divergence,
            "speciation_threshold": threshold,
            "status": "incompatible_barrier"
        }));
        return;
    }

    let (child_genome, strategy_name) = if let Some(pt) = crossover_point {
        let (res_a, _res_b) = MeioticCrossover::single_point_crossover(&g_a, &g_b, pt);
        (res_a, format!("single_point@{}", pt))
    } else {
        let resolved_seed = seed.unwrap_or("genos-default-crossover");
        let res =
            MeioticCrossover::uniform_crossover_with_seed(&g_a, &g_b, swap_prob, resolved_seed);
        (res, format!("uniform_p{:.2}", swap_prob))
    };

    let child_genes: serde_json::Map<String, serde_json::Value> = child_genome
        .genes
        .iter()
        .map(|(k, v)| (k.clone(), serde_json::Value::String(v.dna.as_str())))
        .collect();

    print_json(json!({
        "success": true,
        "operation": "meiotic_crossover",
        "parent_a": parent_a,
        "parent_b": parent_b,
        "parent_a_genome_id": g_a.genome_id().to_string(),
        "parent_b_genome_id": g_b.genome_id().to_string(),
        "child_genome_id": child_genome.genome_id().to_string(),
        "child_genes": child_genes,
        "crossover_strategy": strategy_name,
        "seed": seed.unwrap_or("genos-default-crossover"),
        "maternal_sequence_length": child_genome.chromosome_maternal.len(),
        "paternal_sequence_length": child_genome.chromosome_paternal.len(),
        "phylogenetic_divergence_mya": divergence,
        "speciation_threshold": threshold,
        "speciation_barrier_satisfied": true,
        "status": "recombined"
    }));
}

fn crossover_parent(parent: &str, genes: Option<&str>, defaults: &[(&str, &str)]) -> Genome {
    let mut genome = Genome::new(if genes.is_some() { parent } else { "genos-reproduction-baseline" });
    if let Some(json_str) = genes {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
            if let Some(obj) = parsed.as_object() {
                for (key, value) in obj {
                    let encoded = match value {
                        serde_json::Value::String(text) => text.clone(),
                        _ => value.to_string(),
                    };
                    genome.insert_gene(Gene::new(key, &encoded));
                }
            }
        }
    } else {
        for (key, value) in defaults {
            genome.insert_gene(Gene::new(key, value));
        }
    }
    genome
}
