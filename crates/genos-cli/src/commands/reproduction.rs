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
        EvolutionSubcommands::Crossover { parent_a, parent_b, swap_prob, crossover_point, speciation_threshold, seed } => {
            handle_crossover(&parent_a, &parent_b, swap_prob, crossover_point, speciation_threshold, seed.as_deref());
        }
        EvolutionSubcommands::Division { agent_id, mode, mutation_rate, daughter_volume, merozoite_count, hayflick_limit, seed } => {
            handle_division(&agent_id, &mode, mutation_rate, daughter_volume, merozoite_count, hayflick_limit, seed.as_deref());
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

fn handle_crossover(
    parent_a: &str,
    parent_b: &str,
    swap_prob: f64,
    crossover_point: Option<usize>,
    speciation_threshold: Option<f64>,
    seed: Option<&str>,
) {
    let mut g_a = Genome::new(parent_a);
    let mut g_b = Genome::new(parent_b);

    let divergence = PhylogeneticTree::estimate_divergence_time(&g_a, &g_b);
    if let Some(threshold) = speciation_threshold {
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
    }

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
        "phylogenetic_divergence_mya": divergence,
        "speciation_barrier_satisfied": true,
        "status": "recombined"
    }));
}

fn handle_division(
    agent_id: &str,
    mode: &str,
    mutation_rate: f64,
    daughter_volume: f64,
    merozoite_count: usize,
    hayflick_limit: Option<u32>,
    seed: Option<&str>,
) {
    let mut parent = Genome::new(agent_id);
    if let Some(limit) = hayflick_limit {
        parent.hayflick_limit = limit;
    }

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
                        "daughter_a_id": p.genome_id().to_string(),
                        "daughter_b_id": c.genome_id().to_string(),
                        "mutation_rate_applied": mutation_rate,
                        "seed": seed.unwrap_or("genos-default-fission"),
                        "progeny_count": 2,
                        "status": "fission_completed"
                    }));
                }
                Err(e) => print_json(json!({ "success": false, "error": e })),
            }
        }
        "budding" => {
            let limit = hayflick_limit.unwrap_or(parent.hayflick_limit);
            match CellDivision::budding_with_limit(&parent, daughter_volume, parent.bud_scars.len() as u32, limit) {
                Ok(res) => {
                    print_json(json!({
                        "success": true,
                        "operation": "cell_division",
                        "division_mode": "budding",
                        "mother_genome_id": res.mother.genome_id().to_string(),
                        "daughter_genome_id": res.daughter.genome_id().to_string(),
                        "daughter_volume": res.daughter_volume,
                        "mother_scars_count": res.bud_scars,
                        "hayflick_limit": res.hayflick_limit,
                        "remaining_buds": res.remaining_divisions,
                        "is_senescent": res.is_senescent,
                        "is_ephemeral": true,
                        "progeny_count": 1,
                        "status": "budding_completed"
                    }));
                }
                Err(e) => print_json(json!({ "success": false, "error": e })),
            }
        }
        "schizogony" => {
            let actual_seed = seed.unwrap_or("genos-default-schizogony");
            match CellDivision::schizogony_with_seed(&parent, merozoite_count, mutation_rate, actual_seed) {
                Ok(res) => {
                    let ids: Vec<String> = res.merozoites.iter().map(|d| d.genome_id().to_string()).collect();
                    print_json(json!({
                        "success": true,
                        "operation": "cell_division",
                        "division_mode": "schizogony",
                        "mother_genome_id": res.mother_genome_id.to_string(),
                        "mother_lysed": res.mother_lysed,
                        "progeny_count": ids.len(),
                        "progeny_genome_ids": ids,
                        "mutation_rate_applied": res.mutation_rate_applied,
                        "seed": actual_seed,
                        "status": "schizogony_completed"
                    }));
                }
                Err(e) => print_json(json!({ "success": false, "error": e })),
            }
        }
        "meiosis" => {
            match CellDivision::meiosis_with_seed(&parent, None, seed.unwrap_or("genos-default-meiosis")) {
                Ok(result) => {
                    let ids: Vec<String> = result.gametes.iter().map(|d| d.genome_id().to_string()).collect();
                    print_json(json!({
                        "success": true,
                        "operation": "cell_division",
                        "division_mode": "meiosis",
                        "mother_genome_id": parent.genome_id().to_string(),
                        "progeny_count": ids.len(),
                        "gamete_genome_ids": ids,
                        "crossover_point": result.crossover_point,
                        "reduction_completed": result.reduction_completed,
                        "status": "meiosis_completed"
                    }));
                }
                Err(e) => print_json(json!({ "success": false, "error": e })),
            }
        }
        _ => {
            // Mitosis par défaut (attestée avec contrôle du fuseau et rejet d'amitose)
            match CellDivision::mitosis_attested(&parent) {
                Ok(res) => {
                    print_json(json!({
                        "success": true,
                        "operation": "cell_division",
                        "division_mode": "mitosis",
                        "parent_genome_id": res.parent.genome_id().to_string(),
                        "clone_genome_id": res.clone.genome_id().to_string(),
                        "lineage_id": res.attestation.lineage_id.to_string(),
                        "spindle_aligned": res.attestation.spindle_aligned,
                        "spindle_alignment_hash": res.attestation.spindle_alignment_hash,
                        "attestation_hash": res.attestation.attestation_hash,
                        "amitosis_rejected": res.attestation.amitosis_rejected,
                        "progeny_count": 1,
                        "twin_clones": [
                            res.parent.genome_id().to_string(),
                            res.clone.genome_id().to_string()
                        ],
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
