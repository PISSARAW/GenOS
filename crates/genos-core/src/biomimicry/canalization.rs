//! Canalization / Waddington's Epigenetic Landscape
//!
//! Biological mechanism: Canalization is a measure of the ability of a population
//! to produce the same phenotype regardless of variability of its environment or
//! genotype. It's often visualized as a rolling marble in a valley (Waddington's landscape).
//! GenOS mapping: We measure the robustness of an agent's trajectory. A highly
//! canalized trait will reach its intended state despite small perturbations in
//! initial prompts or environmental noise.

#[derive(Debug, Clone, PartialEq)]
pub struct Trajectory {
    pub final_state_hash: String,
}

#[derive(Debug, Clone)]
pub struct WaddingtonLandscape {
    /// Desired final state (the bottom of the valley)
    pub expected_phenotype: String,
    /// Width of the valley (tolerance for variance)
    pub valley_width: f64,
}

impl WaddingtonLandscape {
    pub fn new(expected_phenotype: String, valley_width: f64) -> Self {
        Self { expected_phenotype, valley_width }
    }

    /// Evaluates if a set of perturbed trajectories are canalized (they converge
    /// to the same expected phenotype within a tolerance margin).
    pub fn evaluate_canalization(&self, trajectories: &[Trajectory]) -> Result<f64, String> {
        if trajectories.is_empty() {
            return Err("No trajectories to evaluate.".to_string());
        }

        let mut converged_count = 0;
        for traj in trajectories {
            if traj.final_state_hash == self.expected_phenotype {
                converged_count += 1;
            }
        }

        let ratio = converged_count as f64 / trajectories.len() as f64;
        
        if ratio >= self.valley_width {
            Ok(ratio)
        } else {
            Err(format!("Phenotype is too brittle. Convergence ratio {:.2} < valley width {:.2}", ratio, self.valley_width))
        }
    }
}
