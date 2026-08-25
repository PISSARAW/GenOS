//! Viral dynamics: lytic bursts, lysogenic prophage cassettes, transduction,
//! and quasispecies guards.
//!
//! Reference design: `docs/3-features-and-domain/resilience/viral_dynamics.md`.
//!
//! Mechanisms and their activation conditions:
//! - **Lytic burst**: triggered when accumulated stress crosses the burst
//!   threshold while no dormant cassette matches the failure context.
//! - **Prophage induction**: triggered when stress crosses the (lower)
//!   induction threshold and dormant cassettes exist — cheaper than a burst.
//! - **Transduction**: never automatic; capsules require an evaluation proof
//!   hash and pass superinfection exclusion plus negative selection.

pub mod cassette;
pub mod controller;

pub use cassette::{
    CassetteState, ProphageLocus, SkillCassette, Superinjection, TransductionCapsule,
    MAX_CASSETTES_PER_LINEAGE,
};
pub use controller::{ViralAction, ViralResponseController};

use serde::{Deserialize, Serialize};

/// Default stress level at which dormant cassettes express.
pub const DEFAULT_INDUCTION_THRESHOLD: f32 = 0.6;

/// Default stress level at which a lytic burst is planned instead of a cheap
/// cassette induction. Strictly above the induction threshold.
pub const DEFAULT_BURST_THRESHOLD: f32 = 0.85;

/// Clones recommended by the controller when a burst fires.
pub const DEFAULT_BURST_CLONES: u32 = 5;

/// Genetic operators applied to burst clones, mirroring hypermutation operons.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BurstOperon {
    PointMutation,
    FrameShift,
    HeuristicInversion,
    ToolPermutation,
    ContextScrambling,
}

const ALL_OPERONS: [BurstOperon; 5] = [
    BurstOperon::PointMutation,
    BurstOperon::FrameShift,
    BurstOperon::HeuristicInversion,
    BurstOperon::ToolPermutation,
    BurstOperon::ContextScrambling,
];

/// Stress metric shared with somatic hypermutation:
/// `tanh(beta * K_consecutive + lambda * (1 - progress))`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StressMetric {
    pub failure_rate_beta: f32,
    pub stagnation_lambda: f32,
}

impl Default for StressMetric {
    fn default() -> Self {
        Self {
            failure_rate_beta: 0.35,
            stagnation_lambda: 0.50,
        }
    }
}

impl StressMetric {
    /// Normalized stress in `[0, 1]`.
    pub fn compute(&self, consecutive_failures: u32, progress: f32) -> f32 {
        let raw = self.failure_rate_beta * consecutive_failures as f32
            + self.stagnation_lambda * (1.0 - progress.clamp(0.0, 1.0));
        raw.tanh().clamp(0.0, 1.0)
    }
}

/// One divergent clone sampled from the quasispecies cloud around a master
/// (stalled) sequence.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BurstClone {
    pub clone_id: String,
    pub operon: BurstOperon,
    pub mutation_offset: f32,
    pub prompt_variant: String,
}

/// Engine bundling the stress metric with the viral thresholds.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ViralDynamicsEngine {
    pub stress: StressMetric,
    pub induction_threshold: f32,
    pub burst_threshold: f32,
}

impl Default for ViralDynamicsEngine {
    fn default() -> Self {
        Self {
            stress: StressMetric::default(),
            induction_threshold: DEFAULT_INDUCTION_THRESHOLD,
            burst_threshold: DEFAULT_BURST_THRESHOLD,
        }
    }
}

impl ViralDynamicsEngine {
    pub fn compute_stress(&self, consecutive_failures: u32, progress: f32) -> f32 {
        self.stress.compute(consecutive_failures, progress)
    }

    /// Quasispecies error-catastrophe guard (theorie d'Eigen): selection acting
    /// on the mutant cloud can only rebuild information while the per-genome
    /// error rate satisfies `u * L < ln(W_max / W_avg)`; expressed as a cloud
    /// width this bounds sigma to `sqrt(ln(W_max / W_avg) / L)`.
    /// Returns `None` when no exploration is admissible.
    pub fn error_catastrophe_sigma(
        &self,
        info_length: f32,
        w_max: f32,
        w_avg: f32,
    ) -> Option<f32> {
        if info_length <= 0.0 || w_max <= w_avg || w_avg <= 0.0 {
            return None;
        }
        Some(((w_max / w_avg).ln() / info_length).sqrt())
    }

    /// Deterministically samples a mutant cloud around the stalled lineage.
    /// Same `(genome_id, seed)` always yields the same clones.
    pub fn plan_burst(
        &self,
        parent_genome: &str,
        clone_count: usize,
        sigma: f32,
        seed: u64,
    ) -> Vec<BurstClone> {
        let mut rng = XorShift64::new(seed);
        (0..clone_count)
            .map(|i| {
                let z = rng.standard_normal();
                let offset = (z * sigma).clamp(-3.0 * sigma, 3.0 * sigma);
                let operon = ALL_OPERONS[(rng.next_u64() % ALL_OPERONS.len() as u64) as usize];
                BurstClone {
                    clone_id: format!("{}-burst{}-{}", parent_genome, seed, i),
                    operon,
                    mutation_offset: offset,
                    prompt_variant: apply_operon(operon, offset),
                }
            })
            .collect()
    }

    /// Assembles a transduction capsule. Fails without an evaluation proof.
    pub fn assemble_capsule(
        &self,
        capsule_id: &str,
        provenance_genome: &str,
        payload_delta: &str,
        failure_mode_signature: Vec<f32>,
        evaluation_proof_hash: &str,
    ) -> Result<TransductionCapsule, String> {
        if evaluation_proof_hash.is_empty() {
            return Err("transduction requires an evaluation proof hash".into());
        }
        Ok(TransductionCapsule {
            capsule_id: capsule_id.to_string(),
            provenance_genome: provenance_genome.to_string(),
            payload_delta: payload_delta.to_string(),
            failure_mode_signature,
            evaluation_proof_hash: evaluation_proof_hash.to_string(),
        })
    }

    /// Negative selection gate reusing the cyber-immune kernel: a capsule that
    /// resonates with the recipient's benign self-corpus is contamination,
    /// not skill.
    pub fn passes_negative_selection(
        &self,
        capsule_signature: &[f32],
        self_corpus: &[Vec<f32>],
        gamma: f32,
        theta_self: f32,
    ) -> bool {
        !self_corpus
            .iter()
            .any(|s| rbf_affinity(s, capsule_signature, gamma) >= theta_self)
    }
}

/// Gaussian radial-basis affinity between two signatures.
pub fn rbf_affinity(a: &[f32], b: &[f32], gamma: f32) -> f32 {
    let dist_sq: f32 = a.iter().zip(b.iter()).map(|(x, y)| (x - y).powi(2)).sum();
    (-gamma * dist_sq).exp()
}

fn apply_operon(operon: BurstOperon, offset: f32) -> String {
    match operon {
        BurstOperon::PointMutation => format!("[BURST::SYNONYM_REPHRASE d={offset:.2}]"),
        BurstOperon::FrameShift => format!("[BURST::INVERT_CONSTRAINT_ORDER d={offset:.2}]"),
        BurstOperon::HeuristicInversion => format!("[BURST::CONTRARIAN_HYPOTHESIS d={offset:.2}]"),
        BurstOperon::ToolPermutation => format!("[BURST::ALTERNATIVE_TOOLCHAIN d={offset:.2}]"),
        BurstOperon::ContextScrambling => format!("[BURST::RESHUFFLE_HYPOTHESES d={offset:.2}]"),
    }
}

/// Minimal deterministic PRNG (xorshift64*) so bursts replay identically.
struct XorShift64 {
    state: u64,
}

impl XorShift64 {
    fn new(seed: u64) -> Self {
        Self { state: if seed == 0 { 0x9E3779B97F4A7C15 } else { seed } }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }

    /// Gaussian sample via Box-Muller.
    fn standard_normal(&mut self) -> f32 {
        let u1 = (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64;
        let u2 = (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64;
        let mag = (-2.0 * u1.max(1e-12).ln()).sqrt();
        let ang = std::f64::consts::TAU * u2;
        (mag * ang.cos()) as f32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stress_saturates_with_failures_and_lagging_progress() {
        let metric = StressMetric::default();
        assert_eq!(metric.compute(0, 1.0), 0.0);
        assert!(metric.compute(10, 0.0) > 0.95);
        assert!(metric.compute(3, 0.5) > metric.compute(1, 0.9));
    }

    #[test]
    fn error_catastrophe_guard_bounds_cloud_width() {
        let engine = ViralDynamicsEngine::default();
        let sigma = engine.error_catastrophe_sigma(4.0, 2.0, 1.0).expect("fitness edge exists");
        assert!((sigma - (2.0f32.ln() / 4.0).sqrt()).abs() < 1e-6);
        assert!(
            engine.error_catastrophe_sigma(4.0, 1.0, 1.0).is_none(),
            "no fitness edge means no admissible exploration"
        );
        assert!(engine.error_catastrophe_sigma(0.0, 2.0, 1.0).is_none());
        // Wider clouds are admissible when selection pressure grows.
        assert!(
            engine.error_catastrophe_sigma(4.0, 8.0, 1.0).unwrap() > sigma,
            "stronger fitness edge relaxes the width bound"
        );
    }

    #[test]
    fn bursts_are_deterministic_per_seed() {
        let engine = ViralDynamicsEngine::default();
        let a = engine.plan_burst("g1", 5, 0.4, 42);
        let b = engine.plan_burst("g1", 5, 0.4, 42);
        assert_eq!(a, b);
        let c = engine.plan_burst("g1", 5, 0.4, 43);
        assert_ne!(a, c, "different seeds explore different clouds");
    }

    #[test]
    fn capsule_requires_evaluation_proof() {
        let engine = ViralDynamicsEngine::default();
        assert!(engine
            .assemble_capsule("c1", "g1", "delta", vec![0.0], "")
            .is_err());
        assert!(engine
            .assemble_capsule("c1", "g1", "delta", vec![0.0], "sha256:abc")
            .is_ok());
    }

    #[test]
    fn negative_selection_rejects_self_resonant_capsules() {
        let engine = ViralDynamicsEngine::default();
        let corpus = vec![vec![0.5, 0.5]];
        assert!(!engine.passes_negative_selection(&[0.5, 0.51], &corpus, 1.0, 0.9));
        assert!(engine.passes_negative_selection(&[9.0, 9.0], &corpus, 1.0, 0.9));
    }
}
