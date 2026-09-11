use crate::args::EvolutionSubcommands;
use crate::commands::biomimicry_ops::print_json;
use genos_genome::{Gene, Genome, Plasmid};
use genos_reproduction::{MeioticCrossover, PhylogeneticTree};
use serde_json::json;

pub fn execute(cmd: EvolutionSubcommands) -> Result<(), String> {
    match cmd {
        EvolutionSubcommands::AssimilatePlasmid { agent_id, source_agent_id, plasmid_name, plasmid_code } => {
            handle_assimilate_plasmid(agent_id, source_agent_id, (plasmid_name, plasmid_code));
        }
        EvolutionSubcommands::Crossover { parent_a, parent_b, swap_prob, crossover_point, speciation_threshold, genes_a, genes_b, seed } => {
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
        EvolutionSubcommands::Division { agent_id, mode, mutation_rate, daughter_volume, merozoite_count, hayflick_limit, genes, seed } => {
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
        EvolutionSubcommands::Phylogeny { action, genome_a, genome_b, mutation_rate, is_plant } => {
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

fn handle_assimilate_plasmid(agent_id: Option<String>, source_agent_id: Option<String>, plasmid_info: (Option<String>, Option<String>)) {
    let (plasmid_name, plasmid_code) = plasmid_info;
    let target = agent_id.unwrap_or_else(|| "recipient".to_string());
    let source = source_agent_id.unwrap_or_else(|| "donor".to_string());
    let name = plasmid_name.unwrap_or_else(|| "plasmid_core".to_string());
    let instruction = plasmid_code.unwrap_or_else(|| name.clone());
    let plasmid = Plasmid::new(&instruction);

    let root = crate::commands::root_resolver::resolve_matrix_root();
    let chromatin_dir = root.join("chromatin");
    let state_path = chromatin_dir.join(format!("{}.json", target));
    let mut genome = if state_path.exists() {
        std::fs::read_to_string(&state_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Genome>(&s).ok())
            .unwrap_or_else(|| Genome::new(&target))
    } else {
        Genome::new(&target)
    };

    if !genome.plasmids.iter().any(|p| p.instruction == plasmid.instruction) {
        genome.plasmids.push(plasmid.clone());
    }

    let _ = std::fs::create_dir_all(&chromatin_dir);
    let persisted = std::fs::write(&state_path, serde_json::to_string_pretty(&genome).unwrap_or_default()).is_ok();

    print_json(json!({
        "success": true, "operation": "assimilate_plasmid",
        "agent_id": target, "source_agent_id": source,
        "plasmid_name": name, "plasmid_code": plasmid.instruction, "plasmid_id": plasmid.id.to_string(),
        "persisted": persisted,
        "plasmids_count": genome.plasmids.len(),
        "status": "assimilated"
    }));
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

    let mut g_a = Genome::new(if genes_a.is_some() { parent_a } else { "genos-reproduction-baseline" });
    let mut g_b = Genome::new(if genes_b.is_some() { parent_b } else { "genos-reproduction-baseline" });

    if let Some(json_str) = genes_a {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
            if let Some(obj) = parsed.as_object() {
                for (k, v) in obj {
                    let val_str = match v {
                        serde_json::Value::String(s) => s.clone(),
                        _ => v.to_string(),
                    };
                    g_a.insert_gene(Gene::new(k, &val_str));
                }
            }
        }
    } else {
        g_a.insert_gene(Gene::new("strategy", "depth_first_mcts"));
        g_a.insert_gene(Gene::new("safety_threshold", "0.95"));
    }

    if let Some(json_str) = genes_b {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
            if let Some(obj) = parsed.as_object() {
                for (k, v) in obj {
                    let val_str = match v {
                        serde_json::Value::String(s) => s.clone(),
                        _ => v.to_string(),
                    };
                    g_b.insert_gene(Gene::new(k, &val_str));
                }
            }
        }
    } else {
        g_b.insert_gene(Gene::new("strategy", "pareto_adversarial"));
        g_b.insert_gene(Gene::new("memory_tier", "vector_synapse"));
    }

    let divergence = PhylogeneticTree::estimate_divergence_time(&g_a, &g_b);
    let threshold = speciation_threshold.unwrap_or(genos_reproduction::phylogeny::MAX_DIVERGENCE_INTROGRESSION);
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
        let res = MeioticCrossover::uniform_crossover_with_seed(&g_a, &g_b, swap_prob, resolved_seed);
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

