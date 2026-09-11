use crate::division::{mutate_nucleotide, MeiosisResult, SchizogonyResult, MAX_MEROZOITES, MIN_MEROZOITES};
use crate::seed::{default_seed, rng_from_seed};
use genos_genome::Genome;
use rand::RngExt;

pub fn schizogony(mother: &Genome, merozoite_count: usize) -> Result<Vec<Genome>, String> {
    let seed = default_seed(&mother.genome_id().to_string(), "schizogony");
    let result = schizogony_with_seed(mother, merozoite_count, (0.0, &seed))?;
    Ok(result.merozoites)
}

pub fn schizogony_with_seed(
    mother: &Genome,
    merozoite_count: usize,
    opts: (f64, &str)
) -> Result<SchizogonyResult, String> {
    let (mutation_rate, seed) = opts;
    if merozoite_count < MIN_MEROZOITES || merozoite_count > MAX_MEROZOITES {
        return Err(format!(
            "Merozoite count must be between {} and {}, got {}",
            MIN_MEROZOITES, MAX_MEROZOITES, merozoite_count
        ));
    }
    if !(0.0..=1.0).contains(&mutation_rate) {
        return Err("Mutation rate must be between 0 and 1".to_string());
    }
    if !mother.can_replicate() {
        return Err("Hayflick limit reached: genome is replicatively senescent".to_string());
    }

    let mut rng = rng_from_seed(seed);
    let mut daughters = Vec::with_capacity(merozoite_count);

    for idx in 0..merozoite_count {
        let mut daughter = mother.derive_child();
        if mutation_rate > 0.0 {
            mutate_daughter_chromosomes(&mut daughter, mutation_rate, &mut rng);
        }
        daughter.insert_gene(genos_genome::Gene::new("merozoite_index", &idx.to_string()));
        daughters.push(daughter);
    }

    Ok(SchizogonyResult {
        mother_genome_id: mother.genome_id(),
        mother_lysed: true,
        merozoites: daughters,
        mutation_rate_applied: mutation_rate,
    })
}

fn mutate_daughter_chromosomes<R: rand::Rng + ?Sized>(daughter: &mut Genome, mutation_rate: f64, rng: &mut R) {
    let mut maternal = daughter.chromosome_maternal.as_slice().to_vec();
    let mut paternal = daughter.chromosome_paternal.as_slice().to_vec();
    for nucleotide in maternal.iter_mut().chain(paternal.iter_mut()) {
        if rng.random_bool(mutation_rate) {
            *nucleotide = match nucleotide {
                genos_genome::DnaNucleotide::A => genos_genome::DnaNucleotide::C,
                genos_genome::DnaNucleotide::C => genos_genome::DnaNucleotide::G,
                genos_genome::DnaNucleotide::G => genos_genome::DnaNucleotide::T,
                genos_genome::DnaNucleotide::T => genos_genome::DnaNucleotide::A,
            };
        }
    }
    daughter.chromosome_maternal.replace_sequence(maternal);
    daughter.chromosome_paternal.replace_sequence(paternal);
}

pub fn meiosis(genome: &Genome, crossover_point: Option<usize>) -> Result<Vec<Genome>, String> {
    let seed = default_seed(&genome.genome_id().to_string(), "meiosis");
    meiosis_with_seed_and_mutation(genome, crossover_point, (&seed, 0.0))
        .map(|r| r.gametes)
}

pub fn meiosis_with_seed(
    genome: &Genome,
    crossover_point: Option<usize>,
    seed: &str
) -> Result<MeiosisResult, String> {
    meiosis_with_seed_and_mutation(genome, crossover_point, (seed, 0.0))
}

pub fn meiosis_with_seed_and_mutation(
    genome: &Genome,
    crossover_point: Option<usize>,
    opts: (&str, f64)
) -> Result<MeiosisResult, String> {
    let (seed, mutation_rate) = opts;
    if !(0.0..=1.0).contains(&mutation_rate) {
        return Err("Mutation rate must be between 0 and 1".to_string());
    }
    let mat_len = genome.chromosome_maternal.len();
    let pat_len = genome.chromosome_paternal.len();
    let min_len = mat_len.min(pat_len);
    if min_len == 0 {
        return Err("Cannot perform meiosis on empty chromosomes".to_string());
    }

    let mut rng = rng_from_seed(seed);
    let pt = crossover_point.map(|p| p.min(min_len)).unwrap_or_else(|| rng.random_range(0..min_len));

    let mat_slice = genome.chromosome_maternal.as_slice();
    let pat_slice = genome.chromosome_paternal.as_slice();

    let mut chrom_2 = mat_slice[..pt].to_vec();
    chrom_2.extend_from_slice(&pat_slice[pt..]);
    let mut chrom_3 = pat_slice[..pt].to_vec();
    chrom_3.extend_from_slice(&mat_slice[pt..]);

    let chromatids = [mat_slice.to_vec(), chrom_2, chrom_3, pat_slice.to_vec()];
    let mut gametes = Vec::with_capacity(4);

    for (i, chrom) in chromatids.into_iter().enumerate() {
        let gamete = build_gamete(genome, (chrom, i, mutation_rate), &mut rng);
        gametes.push(gamete);
    }

    Ok(MeiosisResult {
        mother_genome_id: genome.genome_id(),
        gametes,
        crossover_point: pt,
        reduction_completed: true,
        mutation_rate_applied: mutation_rate,
    })
}

fn build_gamete<R: rand::Rng + ?Sized>(
    genome: &Genome,
    params: (Vec<genos_genome::DnaNucleotide>, usize, f64),
    rng: &mut R,
) -> Genome {
    let (mut chrom, i, mutation_rate) = params;
    if mutation_rate > 0.0 {
        for nucleotide in &mut chrom {
            if rng.random_bool(mutation_rate) {
                *nucleotide = mutate_nucleotide(nucleotide, rng);
            }
        }
    }

    let mut gamete = genome.derive_child();
    gamete.parent_ids = vec![genome.genome_id()];
    gamete.ploidy = "haploid".to_string();
    gamete.chromosome_maternal.replace_sequence(chrom.clone());
    gamete.chromosome_paternal.replace_sequence(chrom);
    gamete.bud_scars.clear();
    gamete.endogenous_retroviruses.clear();
    gamete.extra_chromosomes.clear();

    reset_gamete_epigenetics(&mut gamete, mutation_rate, rng);
    gamete.insert_gene(genos_genome::Gene::new("gamete_meiotic_index", &i.to_string()));
    gamete
}

fn reset_gamete_epigenetics<R: rand::Rng + ?Sized>(gamete: &mut Genome, mutation_rate: f64, rng: &mut R) {
    for gene in gamete.genes.values_mut() {
        if gene.chromatin_state != genos_genome::ChromatinState::HeterochromatinConstitutive {
            gene.is_methylated = false;
            gene.developmentally_locked = false;
            gene.chromatin_state = genos_genome::ChromatinState::Euchromatin;
        }
        if mutation_rate > 0.0 {
            let mut seq = gene.dna.as_slice().to_vec();
            for nucleotide in &mut seq {
                if rng.random_bool(mutation_rate) {
                    *nucleotide = mutate_nucleotide(nucleotide, rng);
                }
            }
            gene.dna.replace_sequence(seq);
        }
    }
}
