use crate::args::EvolutionSubcommands;
use crate::commands::biomimicry_ops::print_json;
use genos_genome::{Gene, Genome, Plasmid};
use genos_reproduction::{
    CellDivision, Domain, EukaryoteClade, HybridizationResult, MeioticCrossover,
    PhylogeneticNode, PhylogeneticTree,
};
use serde_json::json;

pub fn execute(cmd: EvolutionSubcommands) -> Result<(), String> {
    match cmd {
        EvolutionSubcommands::AssimilatePlasmid { agent_id, source_agent_id, plasmid_name } => {
            handle_assimilate_plasmid(agent_id, source_agent_id, plasmid_name);
        }
        EvolutionSubcommands::Crossover { parent_a, parent_b, swap_prob, crossover_point, seed } => {
            handle_crossover(&parent_a, &parent_b, swap_prob, crossover_point, seed.as_deref());
        }
        EvolutionSubcommands::Division { agent_id, mode, mutation_rate, daughter_volume, merozoite_count, seed } => {
            handle_division(&agent_id, &mode, mutation_rate, daughter_volume, merozoite_count, seed.as_deref());
        }
        EvolutionSubcommands::Phylogeny { action, genome_a, genome_b, mutation_rate, is_plant } => {
            handle_phylogeny(&action, &genome_a, genome_b.as_deref(), mutation_rate, is_plant);
        }
    }
    Ok(())
}

fn handle_assimilate_plasmid(agent_id: Option<String>, source_agent_id: Option<String>, plasmid_name: Option<String>) {
    let target = agent_id.unwrap_or_else(|| "recipient".to_string());
    let source = source_agent_id.unwrap_or_else(|| "donor".to_string());
    let name = plasmid_name.unwrap_or_else(|| "plasmid_core".to_string());
    let plasmid = Plasmid::new(&name);
    print_json(json!({
        "success": true, "operation": "assimilate_plasmid",
        "agent_id": target, "source_agent_id": source,
        "plasmid_name": plasmid.instruction, "plasmid_id": plasmid.id.to_string(),
        "status": "assimilated"
    }));
}

fn handle_crossover(parent_a: &str, parent_b: &str, swap_prob: f64, crossover_point: Option<usize>, seed: Option<&str>) {
    let mut g_a = Genome::new(parent_a);
    let mut g_b = Genome::new(parent_b);

    // Enrichir avec quelques gènes de test pour valider l'échange
    g_a.insert_gene(Gene::new("strategy", "depth_first_mcts"));
    g_a.insert_gene(Gene::new("safety_threshold", "0.95"));
    g_b.insert_gene(Gene::new("strategy", "pareto_adversarial"));
    g_b.insert_gene(Gene::new("memory_tier", "vector_synapse"));

    let (child_a_id, child_a_mat_len, strategy_name) = if let Some(pt) = crossover_point {
        let (res_a, _res_b) = MeioticCrossover::single_point_crossover(&g_a, &g_b, pt);
        (
            res_a.genome_id().to_string(),
            res_a.chromosome_maternal.len(),
            format!("single_point@{}", pt),
        )
    } else {
        let resolved_seed = seed.unwrap_or("genos-default-crossover");
        let res = MeioticCrossover::uniform_crossover_with_seed(&g_a, &g_b, swap_prob, resolved_seed);
        (
            res.genome_id().to_string(),
            res.chromosome_maternal.len(),
            format!("uniform_p{:.2}", swap_prob),
        )
    };

    print_json(json!({
        "success": true,
        "operation": "meiotic_crossover",
        "parent_a": parent_a,
        "parent_b": parent_b,
        "parent_a_genome_id": g_a.genome_id().to_string(),
        "parent_b_genome_id": g_b.genome_id().to_string(),
        "child_genome_id": child_a_id,
        "crossover_strategy": strategy_name,
        "seed": seed.unwrap_or("genos-default-crossover"),
        "maternal_sequence_length": child_a_mat_len,
        "status": "recombined"
    }));
}

fn handle_division(agent_id: &str, mode: &str, mutation_rate: f64, daughter_volume: f64, merozoite_count: usize, seed: Option<&str>) {
    let parent = Genome::new(agent_id);

    match mode.to_lowercase().as_str() {
        "binary_fission" | "fission" => {
            match CellDivision::binary_fission_with_seed(&parent, mutation_rate, seed.unwrap_or("genos-default-fission")) {
                Ok((p, c)) => {
                    print_json(json!({
                        "success": true,
                        "operation": "cell_division",
                        "division_mode": "binary_fission",
                        "parent_genome_id": p.genome_id().to_string(),
                        "child_genome_id": c.genome_id().to_string(),
                        "mutation_rate_applied": mutation_rate,
                        "seed": seed.unwrap_or("genos-default-fission"),
                        "progeny_count": 1,
                        "status": "fission_completed"
                    }));
                }
                Err(e) => print_json(json!({ "success": false, "error": e })),
            }
        }
        "budding" => {
            match CellDivision::budding(&parent, daughter_volume) {
                Ok((m, d)) => {
                    print_json(json!({
                        "success": true,
                        "operation": "cell_division",
                        "division_mode": "budding",
                        "mother_genome_id": m.genome_id().to_string(),
                        "daughter_genome_id": d.genome_id().to_string(),
                        "daughter_volume": daughter_volume,
                        "progeny_count": 1,
                        "status": "budding_completed"
                    }));
                }
                Err(e) => print_json(json!({ "success": false, "error": e })),
            }
        }
        "schizogony" => {
            match CellDivision::schizogony(&parent, merozoite_count) {
                Ok(daughters) => {
                    let ids: Vec<String> = daughters.iter().map(|d| d.genome_id().to_string()).collect();
                    print_json(json!({
                        "success": true,
                        "operation": "cell_division",
                        "division_mode": "schizogony",
                        "mother_genome_id": parent.genome_id().to_string(),
                        "progeny_count": ids.len(),
                        "progeny_genome_ids": ids,
                        "status": "schizogony_completed"
                    }));
                }
                Err(e) => print_json(json!({ "success": false, "error": e })),
            }
        }
        _ => {
            // Mitosis par défaut
            match CellDivision::mitosis(&parent) {
                Ok((p, c)) => {
                    print_json(json!({
                        "success": true,
                        "operation": "cell_division",
                        "division_mode": "mitosis",
                        "parent_genome_id": p.genome_id().to_string(),
                        "clone_genome_id": c.genome_id().to_string(),
                        "progeny_count": 1,
                        "status": "mitosis_completed"
                    }));
                }
                Err(e) => print_json(json!({ "success": false, "error": e })),
            }
        }
    }
}

fn handle_phylogeny(action: &str, genome_a: &str, genome_b: Option<&str>, mutation_rate: f64, is_plant: bool) {
    let g_a = Genome::new(genome_a);
    let g_b = Genome::new(genome_b.unwrap_or("ANCESTRAL_REFERENCE_LINEAGE"));

    match action.to_lowercase().as_str() {
        "hybridize" | "hybridization" => {
            let hybrid_res = PhylogeneticTree::attempt_hybridization(&g_a, &g_b, is_plant);
            let (classification, fertile) = match &hybrid_res {
                HybridizationResult::Introgression(_) => ("Introgression (Fertile Descent)", true),
                HybridizationResult::SterileHybrid(_) => ("Sterile Hybrid (Evolutionary Dead-End)", false),
                HybridizationResult::AllopolyploidPlant(_) => ("Allopolyploid Instant Species (Fertile)", true),
                HybridizationResult::Incompatible => ("Incompatible (Genetic Barrier Exceeded)", false),
            };
            print_json(json!({
                "success": true,
                "operation": "phylogeny",
                "action": "hybridization",
                "genome_a": genome_a,
                "genome_b": g_b.genome_id().to_string(),
                "hybridization_result": classification,
                "is_fertile": fertile,
                "is_plant_mode": is_plant,
                "status": "evaluated"
            }));
        }
        "interbreed" => {
            let can_breed = PhylogeneticTree::can_interbreed(&g_a, &g_b, false);
            print_json(json!({
                "success": true,
                "operation": "phylogeny",
                "action": "interbreed_check",
                "genome_a": genome_a,
                "genome_b": g_b.genome_id().to_string(),
                "can_interbreed": can_breed,
                "status": "checked"
            }));
        }
        "molecular_clock" => {
            match genos_reproduction::phylogeny::molecular_clock(&g_a, &g_b, mutation_rate) {
                Ok(generations) => print_json(json!({
                    "success": true,
                    "operation": "phylogeny",
                    "action": "molecular_clock",
                    "genome_a": genome_a,
                    "genome_b": g_b.genome_id().to_string(),
                    "mutation_rate_per_generation": mutation_rate,
                    "estimated_generations_divergence": generations,
                    "status": "calculated"
                })),
                Err(error) => print_json(json!({ "success": false, "error": error }))
            }
        }
        "tree" => {
            let _tree = build_reference_phylogenetic_tree(&g_a);
            print_json(json!({
                "success": true,
                "operation": "phylogeny",
                "action": "tree",
                "root_node": "LUCA",
                "domains": ["Archaea", "Bacteria", "Eukaryota"],
                "clades": ["Plants", "Fungi", "Animals"],
                "target_leaf": genome_a,
                "status": "constructed"
            }));
        }
        _ => {
            // Divergence par défaut
            let divergence_mya = PhylogeneticTree::estimate_divergence_time(&g_a, &g_b);
            print_json(json!({
                "success": true,
                "operation": "phylogeny",
                "action": "divergence",
                "genome_a": genome_a,
                "genome_b": g_b.genome_id().to_string(),
                "divergence_million_years": divergence_mya,
                "status": "estimated"
            }));
        }
    }
}

fn build_reference_phylogenetic_tree(target_genome: &Genome) -> PhylogeneticTree {
    let animal_fungi_ancestor = PhylogeneticNode::CommonNode {
        name: "Opisthokonta".to_string(),
        age_millions_years: 1000.0,
        left: Box::new(PhylogeneticNode::Leaf {
            name: "Animalia".to_string(),
            domain: Domain::Eukaryota,
            clade: Some(EukaryoteClade::Animals),
            genome: target_genome.clone(),
        }),
        right: Box::new(PhylogeneticNode::Leaf {
            name: "Fungi".to_string(),
            domain: Domain::Eukaryota,
            clade: Some(EukaryoteClade::Fungi),
            genome: Genome::new("FUNGI_MYCELIUM_ROOT"),
        }),
    };

    let eukaryote_ancestor = PhylogeneticNode::CommonNode {
        name: "Eukaryota_Ancestor".to_string(),
        age_millions_years: 1500.0,
        left: Box::new(PhylogeneticNode::Leaf {
            name: "Plantae".to_string(),
            domain: Domain::Eukaryota,
            clade: Some(EukaryoteClade::Plants),
            genome: Genome::new("CHLOROPLAST_ROOT"),
        }),
        right: Box::new(animal_fungi_ancestor),
    };

    let luca = PhylogeneticNode::CommonNode {
        name: "LUCA".to_string(),
        age_millions_years: 3800.0,
        left: Box::new(PhylogeneticNode::Leaf {
            name: "Bacteria_Root".to_string(),
            domain: Domain::Bacteria,
            clade: None,
            genome: Genome::new("BACTERIAL_ANCESTOR"),
        }),
        right: Box::new(eukaryote_ancestor),
    };

    PhylogeneticTree::new(luca)
}
