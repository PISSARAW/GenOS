pub mod cascade;
pub mod kuramoto;
pub mod matrix;
pub mod stigmergy;

pub use cascade::{Ligand, Receptor, SignalingMode};
pub use kuramoto::KuramotoOscillator;
pub use matrix::{ExtracellularMatrix, ParacrineSignal, TerritoryClaim};
pub use stigmergy::{Pheromone, StigmergyField};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signaling_and_reception() {
        let ligand = Ligand::new("ATP", SignalingMode::Paracrine, 2.5);
        let receptor = Receptor::new("ATP", "ACTIVATE_GLYCOLYSIS", 1.0);
        let signal = receptor.receive(&ligand);
        assert_eq!(signal, Some("ACTIVATE_GLYCOLYSIS"));
    }

    #[test]
    fn test_stigmergy_deposit_and_evaporation() {
        let mut field = StigmergyField::new(0.5);
        field.deposit("OPTIMAL_PATH", 10.0);
        assert_eq!(field.read("OPTIMAL_PATH"), 10.0);
        field.evaporate();
        assert_eq!(field.read("OPTIMAL_PATH"), 5.0);
    }

    #[test]
    fn test_signals_reject_non_biological_concentrations() {
        let ligand = Ligand::new("ATP", SignalingMode::Paracrine, -2.0);
        assert_eq!(ligand.concentration, 0.0);

        let mut field = StigmergyField::new(2.0);
        field.deposit("INVALID", -1.0);
        assert_eq!(field.read("INVALID"), 0.0);
        field.deposit("VALID", 1.0);
        field.evaporate();
        assert_eq!(field.read("VALID"), 0.0);
    }
}
