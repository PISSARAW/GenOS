//! Bacterial Quorum Sensing biomimetic model.
//!
//! Models cell-cell communication, autoinducer synthesis (AHL/AI-2), diffusion/decay,
//! threshold-dependent synchronized gene activation, positive feedback autoregulation,
//! and quorum quenching (enzymatic lactonase degradation).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AutoinducerType {
    /// Acyl-Homoserine Lactone (typical of Gram-negative bacteria like Vibrio fischeri / Pseudomonas)
    AHL,
    /// Autoinducing Peptide (typical of Gram-positive bacteria)
    AIP,
    /// Autoinducer-2 (universal inter-species signaling molecule, furanosyl borate diester)
    AI2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QuorumPhenotype {
    /// Bioluminescent light emission (Vibrio fischeri model)
    Bioluminescence,
    /// Biofilm synthesis and protective extracellular matrix formation
    BiofilmFormation,
    /// Coordinated expression of virulence factors or defensive enzymes
    VirulenceExpression,
    /// Coordinated secretion of public metabolic goods (syntrophy, exoenzymes)
    MetabolicCooperation,
    /// Competence for horizontal gene transfer / plasmid assimilation
    Competence,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuorumSensingSystem {
    pub autoinducer_type: AutoinducerType,
    /// Number of active cellular agents contributing to the signaling pool
    pub cell_count: usize,
    /// Current extracellular concentration of autoinducer molecules
    pub autoinducer_concentration: f64,
    /// Basal synthesis rate of autoinducer per cell per unit time (alpha)
    pub basal_synthesis_rate: f64,
    /// Positive feedback auto-induction gain when quorum is activated (beta)
    pub autoinduction_gain: f64,
    /// Natural or enzymatic degradation rate of autoinducers (gamma)
    pub degradation_rate: f64,
    /// Critical concentration threshold required for collective activation (C_crit)
    pub activation_threshold: f64,
    /// Set of collective phenotypes triggered upon surpassing activation_threshold
    pub regulated_phenotypes: Vec<QuorumPhenotype>,
}

impl QuorumSensingSystem {
    pub fn new(
        autoinducer_type: AutoinducerType,
        activation_threshold: f64,
        regulated_phenotypes: Vec<QuorumPhenotype>,
    ) -> Self {
        Self {
            autoinducer_type,
            cell_count: 0,
            autoinducer_concentration: 0.0,
            basal_synthesis_rate: 0.1,
            autoinduction_gain: 0.5,
            degradation_rate: 0.05,
            activation_threshold,
            regulated_phenotypes,
        }
    }

    /// Sets the current population cell count.
    pub fn set_cell_count(&mut self, count: usize) {
        self.cell_count = count;
    }

    /// Increments population cell count.
    pub fn add_cells(&mut self, count: usize) {
        self.cell_count = self.cell_count.saturating_add(count);
    }

    /// Decrements population cell count.
    pub fn remove_cells(&mut self, count: usize) {
        self.cell_count = self.cell_count.saturating_sub(count);
    }

    /// Returns whether the quorum critical threshold is reached.
    pub fn is_quorum_reached(&self) -> bool {
        self.autoinducer_concentration >= self.activation_threshold
    }

    /// Returns the fraction of activation: 0.0 below threshold, scaling upwards.
    pub fn activation_level(&self) -> f64 {
        if self.activation_threshold <= 0.0 {
            return 1.0;
        }
        (self.autoinducer_concentration / self.activation_threshold).min(2.0)
    }

    /// Simulates dynamic signaling diffusion and synthesis over a delta time `dt`.
    pub fn step(&mut self, dt: f64) {
        if dt <= 0.0 {
            return;
        }

        // Basal production proportional to cell density
        let basal_production = self.basal_synthesis_rate * (self.cell_count as f64);

        // Positive autoregulatory feedback (LuxR/LuxI loop) if already at or near quorum
        let feedback_production = if self.is_quorum_reached() {
            self.autoinduction_gain * (self.cell_count as f64)
        } else {
            0.0
        };

        // Degradation / clearance
        let decay = self.degradation_rate * self.autoinducer_concentration;

        let d_conc = (basal_production + feedback_production - decay) * dt;
        self.autoinducer_concentration = (self.autoinducer_concentration + d_conc).max(0.0);
    }

    /// Simulates quorum quenching (e.g. bacterial lactonase / acylase degradation).
    pub fn apply_quorum_quenching(&mut self, quenching_strength: f64) {
        let reduction = self.autoinducer_concentration * quenching_strength.clamp(0.0, 1.0);
        self.autoinducer_concentration = (self.autoinducer_concentration - reduction).max(0.0);
    }

    /// Returns active collective phenotypes triggered by quorum sensing.
    pub fn active_phenotypes(&self) -> Vec<QuorumPhenotype> {
        if self.is_quorum_reached() {
            self.regulated_phenotypes.clone()
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quorum_sensing_population_density_threshold() {
        let mut qs = QuorumSensingSystem::new(
            AutoinducerType::AHL,
            5.0,
            vec![QuorumPhenotype::Bioluminescence, QuorumPhenotype::BiofilmFormation],
        );

        assert!(!qs.is_quorum_reached());
        assert!(qs.active_phenotypes().is_empty());

        // Low density: 2 cells
        qs.set_cell_count(2);
        for _ in 0..10 {
            qs.step(1.0);
        }
        // Equilibrium concentration ~ 2 * 0.1 / 0.05 = 4.0 < 5.0
        assert!(!qs.is_quorum_reached(), "Should not reach quorum at low density");

        // High density: 20 cells
        qs.set_cell_count(20);
        for _ in 0..10 {
            qs.step(1.0);
        }
        assert!(qs.is_quorum_reached(), "Should reach quorum at high cell density");
        let phenotypes = qs.active_phenotypes();
        assert_eq!(phenotypes.len(), 2);
        assert!(phenotypes.contains(&QuorumPhenotype::Bioluminescence));
        assert!(phenotypes.contains(&QuorumPhenotype::BiofilmFormation));
    }

    #[test]
    fn test_quorum_quenching_degradation() {
        let mut qs = QuorumSensingSystem::new(
            AutoinducerType::AHL,
            2.0,
            vec![QuorumPhenotype::VirulenceExpression],
        );
        qs.autoinducer_concentration = 10.0;
        assert!(qs.is_quorum_reached());

        // Enzymatic quenching removes 90% of autoinducers
        qs.apply_quorum_quenching(0.9);
        assert_eq!(qs.autoinducer_concentration, 1.0);
        assert!(!qs.is_quorum_reached(), "Quorum should be quenched below threshold");
        assert!(qs.active_phenotypes().is_empty());
    }
}
