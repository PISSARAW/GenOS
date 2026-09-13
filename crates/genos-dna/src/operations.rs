use genos_genome::Genome;
use genos_reproduction::{CellDivision, MeioticCrossover, PhylogeneticTree};
use rand::rngs::StdRng;
use rand::SeedableRng;

use crate::express;
use crate::model::{AgentDna, Crossover, Decoy, Mutation, Provenance};

#[derive(Clone, Debug)]
pub struct CrossOptions {
    pub swap_prob: f64,
    pub point: Option<usize>,
    pub seed: Option<String>,
    pub speciation_threshold: Option<f64>,
}

#[derive(Clone, Debug)]
pub struct MutateOptions {
    pub rate: f64,
    pub hyper: bool,
    pub locus: Option<String>,
    pub seed: Option<String>,
}

#[derive(Clone, Debug)]
pub struct CloneOptions {
    pub mode: String,
    pub daughter_volume: f64,
    pub mutation_rate: f64,
    pub seed: Option<String>,
}

#[derive(Clone, Debug)]
pub struct DecoyOptions {
    pub target_selector: String,
    pub detectability: f64,
    pub marker: Vec<u8>,
}

pub fn cross(parent_a: &AgentDna, parent_b: &AgentDna, options: &CrossOptions) -> Result<AgentDna, String> {
    let genome_a = parent_a.to_genome()?;
    let genome_b = parent_b.to_genome()?;
    let seed = resolve_seed(&options.seed, &format!("cross:{}:{}", parent_a.meta.genome_id, parent_b.meta.genome_id));
    if let Some(threshold) = options.speciation_threshold {
        let divergence = PhylogeneticTree::estimate_divergence_time(&genome_a, &genome_b);
        if divergence > threshold {
            return Err(format!(
                "Speciation barrier exceeded: divergence ({divergence:.2} My) > threshold ({threshold:.2} My)"
            ));
        }
    }
    let child = match options.point {
        Some(point) => MeioticCrossover::single_point_crossover(&genome_a, &genome_b, point).0,
        None => MeioticCrossover::uniform_crossover_with_seed(&genome_a, &genome_b, options.swap_prob, &seed),
    };
    let strategy = crossover_strategy(options);
    let provenance = Provenance {
        source_manifest: parent_a.provenance.source_manifest.clone(),
        source_doc: parent_a.provenance.source_doc.clone(),
        parents: vec![parent_a.meta.genome_id, parent_b.meta.genome_id],
        crossover: Some(Crossover { strategy, seed, point: options.point.map(|point| point as u32) }),
        ..Provenance::default()
    };
    let name = format!("{}x{}", parent_a.meta.name, parent_b.meta.name);
    Ok(rebuild(&child, &name, provenance))
}

pub fn mutate(dna: &AgentDna, options: &MutateOptions) -> Result<AgentDna, String> {
    let mut genome = dna.to_genome()?;
    let seed = resolve_seed(&options.seed, &format!("mutate:{}", dna.meta.genome_id));
    let mut rng = seeded_rng(&seed);
    let kind = if let Some(locus) = &options.locus {
        match genome.genes.get_mut(locus) {
            Some(gene) => {
                gene.dna.mutate_stochastic(options.rate, &mut rng);
                format!("locus:{locus}")
            }
            None => return Err(format!("gene locus '{locus}' not found in '{}'", dna.meta.name)),
        }
    } else if options.hyper {
        genome.hypermutate(options.rate, &mut rng);
        "hypermutate".to_string()
    } else {
        genome.mutate_stochastic(options.rate, &mut rng);
        "stochastic".to_string()
    };
    let mut provenance = dna.provenance.clone();
    provenance.parents = vec![dna.meta.genome_id];
    provenance.mutations.push(Mutation {
        gene: options.locus.clone(),
        kind,
        from: String::new(),
        to: String::new(),
    });
    let name = format!("{}_mut{}", dna.meta.name, provenance.mutations.len());
    Ok(rebuild(&genome, &name, provenance))
}

pub fn clone_dna(dna: &AgentDna, options: &CloneOptions) -> Result<AgentDna, String> {
    let genome = dna.to_genome()?;
    let seed = resolve_seed(&options.seed, &format!("clone:{}", dna.meta.genome_id));
    let child = match options.mode.as_str() {
        "fission" | "binary_fission" => CellDivision::binary_fission_with_seed(&genome, options.mutation_rate, &seed)?.1,
        "budding" => {
            let limits = (0, genome.hayflick_limit, options.mutation_rate);
            CellDivision::budding_with_limit_and_mutation(&genome, options.daughter_volume, limits)?.daughter
        }
        _ => CellDivision::mitosis_attested(&genome)?.clone,
    };
    let provenance = Provenance {
        source_manifest: dna.provenance.source_manifest.clone(),
        source_doc: dna.provenance.source_doc.clone(),
        parents: vec![dna.meta.genome_id],
        ..Provenance::default()
    };
    let name = format!("{}_clone_{}", dna.meta.name, options.mode);
    Ok(rebuild(&child, &name, provenance))
}

pub fn decoy(dna: &AgentDna, options: &DecoyOptions) -> Result<AgentDna, String> {
    let mut output = dna.clone();
    output.provenance.decoy = Some(Decoy {
        marker: resolve_marker(&options.marker),
        target_selector: options.target_selector.clone(),
        detectability: options.detectability.clamp(0.0, 1.0),
    });
    Ok(output)
}

fn crossover_strategy(options: &CrossOptions) -> String {
    match options.point {
        Some(point) => format!("single_point@{point}"),
        None => format!("uniform_p{:.2}", options.swap_prob),
    }
}

fn resolve_seed(seed: &Option<String>, fallback: &str) -> String {
    match seed {
        Some(value) => value.clone(),
        None => fallback.to_string(),
    }
}

fn resolve_marker(marker: &[u8]) -> Vec<u8> {
    if marker.is_empty() {
        return uuid::Uuid::new_v4().into_bytes().to_vec();
    }
    marker.to_vec()
}

fn rebuild(genome: &Genome, name: &str, provenance: Provenance) -> AgentDna {
    let mut dna = AgentDna::from_genome(genome, name, provenance);
    dna.phenotype = Some(express::express(&dna));
    dna
}

fn seeded_rng(seed: &str) -> StdRng {
    let mut state: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in seed.as_bytes() {
        state ^= u64::from(*byte);
        state = state.wrapping_mul(0x0000_0100_0000_01b3);
    }
    StdRng::seed_from_u64(state)
}
