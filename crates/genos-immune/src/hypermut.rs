use super::{AntibodyDetector, Antigen};
use rand::RngExt;

pub struct HypermutParams {
    pub mutation_rate: f64,
    pub clone_count: usize,
}

const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

fn seed_bytes(seed: &str) -> Vec<u8> {
    match seed.is_empty() {
        true => b"GENOS".to_vec(),
        false => seed.as_bytes().to_vec(),
    }
}

fn mutate_bytes(bytes: &mut [u8], rate: f64, rng: &mut rand::rngs::ThreadRng) {
    match rate > 0.0 {
        false => {},
        true => {
            for b in bytes.iter_mut() {
                match rng.random_bool(rate) {
                    true => {
                        let idx = rng.random_range(0..CHARSET.len());
                        *b = CHARSET[idx];
                    }
                    false => {},
                }
            }
        }
    }
}

fn build_detector(mutated: &str, antigen: &Antigen, index: usize) -> AntibodyDetector {
    let mut detector = AntibodyDetector::new(
        &format!("clone-hypermut-{}-{}", uuid::Uuid::new_v4().simple(), index),
        mutated,
        0.5,
    );
    let aff = detector.compute_affinity(antigen);
    detector.affinity_threshold = (aff * 0.8).clamp(0.2, 0.9);
    detector
}

struct CloneContext<'a> {
    base: &'a [String],
    params: &'a HypermutParams,
    antigen: &'a Antigen,
}

struct CloneJob<'a> {
    seed: &'a str,
    index: usize,
    antigen_and_rate: (&'a Antigen, f64),
}

fn clone_job<'a>(ctx: &'a CloneContext<'a>, i: usize) -> CloneJob<'a> {
    CloneJob { seed: &ctx.base[i % ctx.base.len()], index: i, antigen_and_rate: (ctx.antigen, ctx.params.mutation_rate) }
}

fn clone_at(job: CloneJob<'_>, rng: &mut rand::rngs::ThreadRng) -> AntibodyDetector {
    let mut bytes = seed_bytes(job.seed);
    mutate_bytes(&mut bytes, job.antigen_and_rate.1, rng);
    let mutated = String::from_utf8_lossy(&bytes).to_string();
    build_detector(&mutated, job.antigen_and_rate.0, job.index)
}

pub fn generate_clones(base: &[String], params: &HypermutParams, antigen: &Antigen) -> Vec<AntibodyDetector> {
    let mut rng = rand::rng();
    let mut clones = Vec::with_capacity(params.clone_count);
    let ctx = CloneContext { base, params, antigen };
    for i in 0..params.clone_count {
        let job = clone_job(&ctx, i);
        clones.push(clone_at(job, &mut rng));
    }
    clones
}

pub fn sort_by_affinity(clones: &mut [AntibodyDetector], antigen: &Antigen) {
    clones.sort_by(|a, b| {
        let aff_b = b.compute_affinity(antigen);
        let aff_a = a.compute_affinity(antigen);
        aff_b.partial_cmp(&aff_a).unwrap_or(std::cmp::Ordering::Equal)
    });
}

pub fn best_affinity(clones: &[AntibodyDetector], antigen: &Antigen) -> f64 {
    match clones.first() {
        None => 0.0,
        Some(d) => d.compute_affinity(antigen),
    }
}