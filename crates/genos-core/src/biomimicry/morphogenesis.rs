//! 2D reaction-diffusion morphogenesis engine (Turing patterns, Gray-Scott kinetics).
//!
//! Self-organizes agent-team topologies: the activator models leadership
//! demand, the inhibitor models redundancy suppression. Stable heterogeneous
//! patterns emerge without any central bottleneck, and cell roles are read
//! off the local morphogen concentration (Wolpert's French-flag model).
//!
//! Reference design: `docs/3-features-and-domain/biomimicry/morphogenesis.md`.

use serde::{Deserialize, Serialize};

/// Default inhibitor-to-activator diffusion ratio (`Dv = 10 * Du`).
pub const DEFAULT_DIFFUSION_RATIO: f32 = 10.0;

/// Agent roles produced by differentiation on the morphogen landscape.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum MorphogenRole {
    /// High activator: leads a work package.
    LeadArchitect,
    /// Mid activator: implements.
    CoreImplementer,
    /// Low activator, high inhibitor gradient: quality sentinel.
    QASentinel,
    /// Below all thresholds: elastic reserve.
    IdleReserve,
}

/// A square NxN reaction-diffusion field with periodic boundary conditions.
///
/// Kinetics: Gray-Scott autocatalysis (`u` = substrate, `v` = autocatalytic
/// activator) — the canonical, numerically robust Turing pattern generator.
/// `activator` plays the leadership-morphogen role, `inhibitor` stores the
/// substrate field (high away from activity centers).
#[derive(Clone, Debug)]
pub struct MorphogenesisEngine {
    pub size: usize,
    pub du: f32,
    pub dv: f32,
    /// Substrate feed rate `F`.
    pub feed: f32,
    /// Autocatalyst kill rate `k`.
    pub kill: f32,
    pub activator: Vec<f32>,
    pub inhibitor: Vec<f32>,
}

impl MorphogenesisEngine {
    /// Creates an engine with small deterministic perturbations that break the
    /// homogeneous symmetry (same seed => same replay).
    pub fn new(size: usize, seed: u64) -> Self {
        let n = size * size;
        // Substrate presque partout ; activateur quasi absent.
        let mut inhibitor = vec![0.9_f32; n];
        let mut activator = vec![0.0_f32; n];
        let mut rng = seed | 1;
        for cell in activator.iter_mut() {
            let unit =
                ((crate::hgt::splitmix64(&mut rng) >> 40) as f32) / ((1u64 << 24) as f32);
            // Quelques germes d'auto-catalyse suffisent à amorcer les motifs.
            *cell = if unit > 0.985 { 0.5 } else { 0.02 };
        }
        for cell in inhibitor.iter_mut() {
            let unit =
                ((crate::hgt::splitmix64(&mut rng) >> 40) as f32) / ((1u64 << 24) as f32);
            *cell -= unit * 0.01;
        }
        Self {
            size,
            du: 0.14,
            dv: 0.07,
            feed: 0.034,
            kill: 0.0618,
            activator,
            inhibitor,
        }
    }

    fn idx(&self, x: usize, y: usize) -> usize {
        (y % self.size) * self.size + (x % self.size)
    }

    /// Discrete Laplacian with periodic boundaries (5-point stencil).
    fn laplacian(&self, field: &[f32], x: usize, y: usize) -> f32 {
        let c = field[self.idx(x, y)];
        let up = field[self.idx(x, y + self.size - 1)];
        let down = field[self.idx(x, y + 1)];
        let left = field[self.idx(x + self.size - 1, y)];
        let right = field[self.idx(x + 1, y)];
        up + down + left + right - 4.0 * c
    }

    /// Advances the Gray-Scott kinetics one explicit-Euler step (dt = 1):
    /// `du = Du*lap(u) - u*v^2 + F*(1-u)`
    /// `dv = Dv*lap(v) + u*v^2 - (F+k)*v`
    pub fn step(&mut self, _dt: f32) {
        let mut next_u = self.inhibitor.clone();
        let mut next_v = self.activator.clone();
        for y in 0..self.size {
            for x in 0..self.size {
                let i = self.idx(x, y);
                let u = self.inhibitor[i];
                let v = self.activator[i];
                let reaction = u * v * v;
                next_u[i] = (u
                    + self.du * self.laplacian(&self.inhibitor, x, y)
                    - reaction
                    + self.feed * (1.0 - u))
                    .clamp(0.0, 1.5);
                next_v[i] = (v
                    + self.dv * self.laplacian(&self.activator, x, y)
                    + reaction
                    - (self.feed + self.kill) * v)
                    .clamp(0.0, 1.5);
            }
        }
        self.inhibitor = next_u;
        self.activator = next_v;
    }

    /// Runs `steps` iterations and reports whether a spatial pattern emerged
    /// (variance across the activator field above `epsilon`).
    pub fn run_until_pattern(&mut self, steps: usize, _dt: f32, epsilon: f32) -> bool {
        for _ in 0..steps {
            self.step(1.0);
        }
        let mean = self.activator.iter().sum::<f32>() / self.activator.len() as f32;
        let variance = self
            .activator
            .iter()
            .map(|a| (a - mean) * (a - mean))
            .sum::<f32>()
            / self.activator.len() as f32;
        variance > epsilon
    }

    /// Wolpert differentiation at `(x, y)` with two thresholds on local
    /// activator concentration plus a substrate-depletion bonus for sentinels
    /// (perimeter of active spots).
    pub fn differentiate_at(
        &self,
        x: usize,
        y: usize,
        thresh_high: f32,
        thresh_low: f32,
    ) -> MorphogenRole {
        let a = self.activator[self.idx(x, y)];
        let h = self.inhibitor[self.idx(x, y)];
        let h_max = self.inhibitor.iter().cloned().fold(f32::MIN, f32::max);
        if a >= thresh_high {
            MorphogenRole::LeadArchitect
        } else if a >= thresh_low {
            MorphogenRole::CoreImplementer
        } else if h < h_max * 0.85 {
            // Substrat nettement épuisé : poste d'observation qualité en
            // périphérie des zones actives.
            MorphogenRole::QASentinel
        } else {
            MorphogenRole::IdleReserve
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn homogeneous_state_is_unstable_and_patterns_emerge() {
        // Un état quasi homogène doit développer une structure spatiale :
        // c'est l'essence même de l'auto-organisation Turing.
        let mut engine = MorphogenesisEngine::new(24, 42);
        assert!(engine.run_until_pattern(400, 0.1, 1e-4));
    }

    #[test]
    fn deterministic_seeding_replays_identical_fields() {
        let mut a = MorphogenesisEngine::new(8, 7);
        let mut b = MorphogenesisEngine::new(8, 7);
        a.step(0.1);
        b.step(0.1);
        assert_eq!(a.activator, b.activator);
        // Un autre seed diverge.
        let mut c = MorphogenesisEngine::new(8, 8);
        c.step(0.1);
        assert_ne!(a.activator, c.activator);
    }

    #[test]
    fn fields_stay_bounded() {
        let mut engine = MorphogenesisEngine::new(16, 3);
        for _ in 0..200 {
            engine.step(0.1);
        }
        assert!(engine.activator.iter().all(|a| (0.0..=2.0).contains(a)));
        assert!(engine.inhibitor.iter().all(|h| (0.0..=2.0).contains(h)));
    }

    #[test]
    fn differentiation_produces_all_four_roles() {
        let mut engine = MorphogenesisEngine::new(24, 11);
        engine.run_until_pattern(300, 0.1, 1e-4);
        let mut roles = std::collections::BTreeSet::new();
        for y in 0..engine.size {
            for x in 0..engine.size {
                roles.insert(engine.differentiate_at(x, y, 0.25, 0.08));
            }
        }
        // Sur un vrai motif de Turing, les quatre rôles doivent apparaître.
        assert!(roles.contains(&MorphogenRole::LeadArchitect));
        assert!(roles.contains(&MorphogenRole::CoreImplementer));
        assert!(roles.contains(&MorphogenRole::QASentinel));
        assert!(roles.contains(&MorphogenRole::IdleReserve));
    }
}






