use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Niveau de stabilité d'un génome.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum StabilityLevel {
    Stable,
    Compromised,
    Critical,
}

/// Rapport d'intégrité génomique.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GenomeStabilityReport {
    pub genome_id: Uuid,
    pub level: StabilityLevel,
    pub mutation_rate: f64,
    pub anomaly_count: u32,
    pub verified_at: Option<String>,
}

impl Default for GenomeStabilityReport {
    fn default() -> Self {
        Self {
            genome_id: Uuid::nil(),
            level: StabilityLevel::Stable,
            mutation_rate: 0.0,
            anomaly_count: 0,
            verified_at: None,
        }
    }
}

/// Seuil maximal de mutation admis pour considérer un génome stable.
pub const MAX_MUTATION_RATE: f64 = 0.01;
/// Nombre maximal d'anomalies toléré.
pub const MAX_ANOMALY_COUNT: u32 = 0;

/// Évalue la stabilité génomique d'un génome à partir de son taux de mutation
/// et du nombre d'anomalies détectées.
pub fn assess_stability(
    genome_id: Uuid,
    mutation_rate: f64,
    anomaly_count: u32,
) -> GenomeStabilityReport {
    let level = if mutation_rate > MAX_MUTATION_RATE || anomaly_count > MAX_ANOMALY_COUNT {
        if mutation_rate > 2.0 * MAX_MUTATION_RATE || anomaly_count > 3 * MAX_ANOMALY_COUNT {
            StabilityLevel::Critical
        } else {
            StabilityLevel::Compromised
        }
    } else {
        StabilityLevel::Stable
    };
    GenomeStabilityReport {
        genome_id,
        level,
        mutation_rate,
        anomaly_count,
        verified_at: None,
    }
}

/// Vérifie si un taux de mutation respecte le seuil de stabilité.
pub fn mutation_rate_ok(rate: f64) -> bool {
    rate <= MAX_MUTATION_RATE
}

/// Vérifie si le nombre d'anomalies respecte le seuil de stabilité.
pub fn anomaly_count_ok(count: u32) -> bool {
    count <= MAX_ANOMALY_COUNT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_genome_is_assessed_stable() {
        let id = Uuid::new_v4();
        let report = assess_stability(id, 0.001, 0);
        assert_eq!(report.level, StabilityLevel::Stable);
        assert_eq!(report.genome_id, id);
        assert!(mutation_rate_ok(report.mutation_rate));
        assert!(anomaly_count_ok(report.anomaly_count));
    }

    #[test]
    fn high_mutation_rate_is_compromised() {
        let id = Uuid::new_v4();
        let report = assess_stability(id, 0.015, 0);
        assert_eq!(report.level, StabilityLevel::Compromised);
        assert!(!mutation_rate_ok(report.mutation_rate));
    }

    #[test]
    fn many_anomalies_are_critical() {
        let id = Uuid::new_v4();
        let report = assess_stability(id, 0.001, 5);
        assert_eq!(report.level, StabilityLevel::Critical);
        assert!(!anomaly_count_ok(report.anomaly_count));
    }

    #[test]
    fn boundary_rates_respect_thresholds() {
        assert!(mutation_rate_ok(MAX_MUTATION_RATE));
        assert!(!mutation_rate_ok(MAX_MUTATION_RATE + 0.001));
        assert!(anomaly_count_ok(MAX_ANOMALY_COUNT));
        assert!(!anomaly_count_ok(MAX_ANOMALY_COUNT + 1));
    }
}
