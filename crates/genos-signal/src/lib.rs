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

    #[test]
    fn test_matrix_signal_decay() {
        let mut matrix = ExtracellularMatrix::new();
        let ligand = Ligand::new("CYTOKINE", SignalingMode::Paracrine, 1.0);
        matrix.emit_signal(ParacrineSignal {
            source_idx: 0,
            ligand,
            ttl: 2,
        });
        assert_eq!(matrix.paracrine_signals.len(), 1);
        matrix.decay_signals();
        assert_eq!(matrix.paracrine_signals.len(), 1);
        matrix.decay_signals();
        assert_eq!(matrix.paracrine_signals.len(), 0);
    }

    #[test]
    fn test_stigmergy_saturation_limit() {
        let mut field = StigmergyField::new(0.1).with_max_intensity(50.0);
        field.deposit("HOT_PATH", 40.0);
        assert_eq!(field.read("HOT_PATH"), 40.0);
        field.deposit("HOT_PATH", 30.0);
        // Doit être plafonné à max_intensity (50.0) et non 70.0
        assert_eq!(field.read("HOT_PATH"), 50.0);
    }

    #[test]
    fn test_stigmergy_repellent_anti_stigmergy() {
        let mut field = StigmergyField::new(0.2);
        field.deposit_repellent("DEAD_END_BUG", 15.0);
        assert_eq!(field.read("DEAD_END_BUG"), -15.0);
        assert!(field.get_pheromone("DEAD_END_BUG").unwrap().is_repellent);

        // L'évaporation atténue également la phéromone répulsive vers 0
        field.evaporate();
        assert_eq!(field.read("DEAD_END_BUG"), -12.0);
    }

    #[test]
    fn test_stigmergy_continuous_evaporation_dt() {
        let mut field = StigmergyField::new(0.1);
        field.deposit("PATH_A", 100.0);
        // Décroissance exponentielle : I(t) = 100 * e^(-0.1 * 10) = 100 * e^(-1) ≈ 36.7879
        field.evaporate_dt(10.0);
        let val = field.read("PATH_A");
        assert!((val - 36.7879).abs() < 0.01, "Expected ~36.79, got {}", val);
    }

    #[test]
    fn test_stigmergy_json_serialization_roundtrip() {
        let mut field = StigmergyField::new(0.25).with_max_intensity(80.0);
        field.deposit("CODE_ARTIFACT_A", 45.0);
        field.deposit_repellent("BROKEN_BRANCH", 20.0);

        let json_str = field.to_json().expect("Serialization must succeed");
        let restored = StigmergyField::from_json(&json_str).expect("Deserialization must succeed");

        assert_eq!(field, restored);
        assert_eq!(restored.read("CODE_ARTIFACT_A"), 45.0);
        assert_eq!(restored.read("BROKEN_BRANCH"), -20.0);
        assert!(restored.get_pheromone("BROKEN_BRANCH").unwrap().is_repellent);
    }
}

