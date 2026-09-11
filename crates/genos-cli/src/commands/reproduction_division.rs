use crate::commands::biomimicry_ops::print_json;
use genos_genome::{Gene, Genome};
use genos_reproduction::{
    CellDivision, Domain, EukaryoteClade, HybridizationResult,
    PhylogeneticNode, PhylogeneticTree,
};
use serde_json::json;
use std::path::Path;

pub struct DivisionArgs<'a> {
    pub agent_id: &'a str,
    pub mode: &'a str,
    pub mutation_rate: f64,
    pub daughter_volume: f64,
    pub merozoite_count: usize,
    pub hayflick_limit: Option<u32>,
    pub genes: Option<&'a str>,
    pub seed: Option<&'a str>,
}

pub struct PhylogenyArgs<'a> {
    pub action: &'a str,
    pub genome_a: &'a str,
    pub genome_b: Option<&'a str>,
    pub mutation_rate: f64,
    pub is_plant: bool,
}

pub fn handle_division(args: DivisionArgs) {
    let root = crate::commands::root_resolver::resolve_matrix_root();
    let chromatin_dir = root.join("chromatin");
    let parent_path = chromatin_dir.join(format!("{}.json", args.agent_id));
    let mut parent = if parent_path.exists() {
        std::fs::read_to_string(&parent_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Genome>(&s).ok())
            .unwrap_or_else(|| Genome::new(args.agent_id))
    } else {
        Genome::new(args.agent_id)
    };

    if let Some(json_str) = args.genes {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str) {
            if let Some(obj) = parsed.as_object() {
                for (k, v) in obj {
                    let val_str = match v {
                        serde_json::Value::String(s) => s.clone(),
                        _ => v.to_string(),
                    };
                    parent.insert_gene(Gene::new(k, &val_str));
                }
            }
        }
    }

    if let Some(limit) = args.hayflick_limit {
        parent.hayflick_limit = limit;
    }

    let _ = std::fs::create_dir_all(&chromatin_dir);

    match args.mode.to_lowercase().as_str() {
        "binary_fission" | "fission" => {
            handle_fission(&parent, (&parent_path, &chromatin_dir), (args.mutation_rate, args.seed));
        }
        "budding" => {
            let limit = args.hayflick_limit.unwrap_or(parent.hayflick_limit);
            handle_budding(&parent, (&parent_path, &chromatin_dir), (args.daughter_volume, limit));
        }
        "schizogony" => {
            let actual_seed = args.seed.unwrap_or("genos-default-schizogony");
            handle_schizogony(&parent, &chromatin_dir, (args.merozoite_count, args.mutation_rate, actual_seed));
        }
        "meiosis" => {
            let actual_seed = args.seed.unwrap_or("genos-default-meiosis");
            handle_meiosis(&parent, &chromatin_dir, (args.mutation_rate, actual_seed));
        }
        _ => {
            handle_mitosis(&parent);
        }
    }
}

fn handle_fission(parent: &Genome, paths: (&Path, &Path), opts: (f64, Option<&str>)) {
    let (parent_path, chromatin_dir) = paths;
    let (mutation_rate, seed) = opts;
    let actual_seed = seed.unwrap_or("genos-default-fission");
    match CellDivision::binary_fission_with_seed(parent, mutation_rate, actual_seed) {
        Ok((p, c)) => {
            let _ = std::fs::write(parent_path, serde_json::to_string_pretty(&p).unwrap_or_default());
            let child_path = chromatin_dir.join(format!("{}.json", c.genome_id()));
            let _ = std::fs::write(&child_path, serde_json::to_string_pretty(&c).unwrap_or_default());
            print_json(json!({
                "success": true, "operation": "cell_division", "division_mode": "binary_fission",
                "parent_genome_id": p.genome_id().to_string(), "child_genome_id": c.genome_id().to_string(),
                "daughter_a_id": p.genome_id().to_string(), "daughter_b_id": c.genome_id().to_string(),
                "parent_genes_count": parent.genes.len(), "child_genes_count": c.genes.len(),
                "mutation_rate_applied": mutation_rate, "seed": actual_seed, "progeny_count": 2,
                "status": "fission_completed"
            }));
        }
        Err(e) => print_json(json!({ "success": false, "error": e })),
    }
}

fn handle_budding(parent: &Genome, paths: (&Path, &Path), opts: (f64, u32)) {
    let (parent_path, chromatin_dir) = paths;
    let (daughter_volume, limit) = opts;
    match CellDivision::budding_with_limit(parent, daughter_volume, (parent.bud_scars.len() as u32, limit)) {
        Ok(res) => {
            let _ = std::fs::write(parent_path, serde_json::to_string_pretty(&res.mother).unwrap_or_default());
            let daughter_path = chromatin_dir.join(format!("{}.json", res.daughter.genome_id()));
            let _ = std::fs::write(&daughter_path, serde_json::to_string_pretty(&res.daughter).unwrap_or_default());
            print_json(json!({
                "success": true, "operation": "cell_division", "division_mode": "budding",
                "mother_genome_id": res.mother.genome_id().to_string(),
                "daughter_genome_id": res.daughter.genome_id().to_string(),
                "daughter_volume": res.daughter_volume, "mother_scars_count": res.bud_scars,
                "mother_genes_count": res.mother.genes.len(), "daughter_genes_count": res.daughter.genes.len(),
                "hayflick_limit": res.hayflick_limit, "remaining_buds": res.remaining_divisions,
                "is_senescent": res.is_senescent, "is_ephemeral": true, "progeny_count": 2,
                "status": "budding_completed"
            }));
        }
        Err(e) => print_json(json!({ "success": false, "error": e })),
    }
}

fn handle_schizogony(parent: &Genome, chromatin_dir: &Path, opts: (usize, f64, &str)) {
    let (merozoite_count, mutation_rate, seed) = opts;
    match CellDivision::schizogony_with_seed(parent, merozoite_count, (mutation_rate, seed)) {
        Ok(res) => {
            let ids: Vec<String> = res.merozoites.iter().map(|d| d.genome_id().to_string()).collect();
            for d in &res.merozoites {
                let path = chromatin_dir.join(format!("{}.json", d.genome_id()));
                let _ = std::fs::write(&path, serde_json::to_string_pretty(d).unwrap_or_default());
            }
            print_json(json!({
                "success": true, "operation": "cell_division", "division_mode": "schizogony",
                "mother_genome_id": res.mother_genome_id.to_string(),
                "mother_lysed": res.mother_lysed, "progeny_count": ids.len(),
                "progeny_genome_ids": ids, "mother_genes_count": parent.genes.len(),
                "mutation_rate_applied": res.mutation_rate_applied, "seed": seed,
                "status": "schizogony_completed"
            }));
        }
        Err(e) => print_json(json!({ "success": false, "error": e })),
    }
}

fn handle_meiosis(parent: &Genome, chromatin_dir: &Path, opts: (f64, &str)) {
    let (mutation_rate, seed) = opts;
    match CellDivision::meiosis_with_seed_and_mutation(parent, None, (seed, mutation_rate)) {
        Ok(result) => {
            let ids: Vec<String> = result.gametes.iter().map(|d| d.genome_id().to_string()).collect();
            for g in &result.gametes {
                let path = chromatin_dir.join(format!("{}.json", g.genome_id()));
                let _ = std::fs::write(&path, serde_json::to_string_pretty(g).unwrap_or_default());
            }
            print_json(json!({
                "success": true, "operation": "cell_division", "division_mode": "meiosis",
                "mother_genome_id": parent.genome_id().to_string(), "progeny_count": ids.len(),
                "gamete_genome_ids": ids, "crossover_point": result.crossover_point,
                "reduction_completed": result.reduction_completed,
                "mutation_rate_applied": result.mutation_rate_applied,
                "status": "meiosis_completed"
            }));
        }
        Err(e) => print_json(json!({ "success": false, "error": e })),
    }
}

fn handle_mitosis(parent: &Genome) {
    match CellDivision::mitosis_attested(parent) {
        Ok(res) => {
            print_json(json!({
                "success": true, "operation": "cell_division", "division_mode": "mitosis",
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

pub fn handle_phylogeny(args: PhylogenyArgs) {
    let g_a = Genome::new(args.genome_a);
    let g_b = Genome::new(args.genome_b.unwrap_or("ANCESTRAL_REFERENCE_LINEAGE"));

    match args.action.to_lowercase().as_str() {
        "hybridize" | "hybridization" => {
            let hybrid_res = PhylogeneticTree::attempt_hybridization(&g_a, &g_b, args.is_plant);
            let (classification, fertile) = match &hybrid_res {
                HybridizationResult::Introgression(_) => ("Introgression (Fertile Descent)", true),
                HybridizationResult::SterileHybrid(_) => ("Sterile Hybrid (Evolutionary Dead-End)", false),
                HybridizationResult::AllopolyploidPlant(_) => ("Allopolyploid Instant Species (Fertile)", true),
                HybridizationResult::Incompatible => ("Incompatible (Genetic Barrier Exceeded)", false),
            };
            print_json(json!({
                "success": true, "operation": "phylogeny", "action": "hybridization",
                "genome_a": args.genome_a, "genome_b": g_b.genome_id().to_string(),
                "hybridization_result": classification, "is_fertile": fertile,
                "is_plant_mode": args.is_plant, "status": "evaluated"
            }));
        }
        "interbreed" => {
            let can_breed = PhylogeneticTree::can_interbreed(&g_a, &g_b, false);
            print_json(json!({
                "success": true, "operation": "phylogeny", "action": "interbreed_check",
                "genome_a": args.genome_a, "genome_b": g_b.genome_id().to_string(),
                "can_interbreed": can_breed, "status": "checked"
            }));
        }
        "molecular_clock" => {
            match genos_reproduction::phylogeny::molecular_clock(&g_a, &g_b, args.mutation_rate) {
                Ok(generations) => print_json(json!({
                    "success": true, "operation": "phylogeny", "action": "molecular_clock",
                    "genome_a": args.genome_a, "genome_b": g_b.genome_id().to_string(),
                    "mutation_rate_per_generation": args.mutation_rate,
                    "estimated_generations_divergence": generations, "status": "calculated"
                })),
                Err(error) => print_json(json!({ "success": false, "error": error }))
            }
        }
        "tree" => {
            let _tree = build_reference_phylogenetic_tree(&g_a);
            print_json(json!({
                "success": true, "operation": "phylogeny", "action": "tree",
                "root_node": "LUCA", "domains": ["Archaea", "Bacteria", "Eukaryota"],
                "clades": ["Plants", "Fungi", "Animals"], "target_leaf": args.genome_a,
                "status": "constructed"
            }));
        }
        _ => {
            let divergence_mya = PhylogeneticTree::estimate_divergence_time(&g_a, &g_b);
            print_json(json!({
                "success": true, "operation": "phylogeny", "action": "divergence",
                "genome_a": args.genome_a, "genome_b": g_b.genome_id().to_string(),
                "divergence_million_years": divergence_mya, "status": "estimated"
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
