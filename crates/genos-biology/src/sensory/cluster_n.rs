use serde::{Deserialize, Serialize};

/// État quantique de la paire de radicaux du cryptochrome
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum CryptochromeRadicalState {
    SingletCoherent,
    TripletRecombined,
    EntangledActive,
}

/// Rapport d'alignement géomagnétique et de dérive d'intention (Cluster N)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct IntentAlignmentReport {
    pub angular_drift_deg: f64,
    pub cosine_similarity: f64,
    pub quantum_coherence_score: f64,
    pub is_aligned: bool,
    pub correction_heading: Vec<f64>,
    pub navigational_state: String,
    pub radical_state: CryptochromeRadicalState,
}

/// Cluster N (Centre de magnétoréception quantique)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterN {
    pub inclination_sensitivity: f64,
    pub drift_tolerance_deg: f64,
    pub night_migration_mode: bool,
    pub alignment_history_count: usize,
}

impl Default for ClusterN {
    fn default() -> Self {
        Self::new(0.02, 15.0)
    }
}

impl ClusterN {
    pub fn new(inclination_sensitivity: f64, drift_tolerance_deg: f64) -> Self {
        Self {
            inclination_sensitivity: inclination_sensitivity.max(0.001),
            drift_tolerance_deg: drift_tolerance_deg.clamp(1.0, 90.0),
            night_migration_mode: true,
            alignment_history_count: 0,
        }
    }

    /// Calcule la similarité cosinus et l'angle de dérive entre l'intention globale et la trajectoire actuelle
    pub fn compute_intent_heading(&mut self, goal_vec: &[f64], current_vec: &[f64]) -> IntentAlignmentReport {
        self.alignment_history_count += 1;

        if goal_vec.is_empty() || current_vec.is_empty() || goal_vec.len() != current_vec.len() {
            return IntentAlignmentReport {
                angular_drift_deg: 0.0,
                cosine_similarity: 1.0,
                quantum_coherence_score: 1.0,
                is_aligned: true,
                correction_heading: goal_vec.to_vec(),
                navigational_state: "DEFAULT_ORIGIN".to_string(),
                radical_state: CryptochromeRadicalState::SingletCoherent,
            };
        }

        let dot_product: f64 = goal_vec.iter().zip(current_vec.iter()).map(|(a, b)| a * b).sum();
        let norm_goal = (goal_vec.iter().map(|x| x * x).sum::<f64>()).sqrt();
        let norm_curr = (current_vec.iter().map(|x| x * x).sum::<f64>()).sqrt();

        let denominator = norm_goal * norm_curr;
        let cosine = if denominator > 0.0 {
            (dot_product / denominator).clamp(-1.0, 1.0)
        } else {
            1.0
        };

        let angle_rad = cosine.acos();
        let angle_deg = angle_rad.to_degrees();

        let is_aligned = angle_deg <= self.drift_tolerance_deg;

        // Vecteur de correction = normalisation de (goal - current) + goal
        let mut correction_vec = Vec::with_capacity(goal_vec.len());
        for (g, c) in goal_vec.iter().zip(current_vec.iter()) {
            correction_vec.push(((g * 2.0 - c) * 1000.0).round() / 1000.0);
        }

        let coherence = ((cosine.max(0.0).powi(2) * (1.0 - self.inclination_sensitivity)) * 1000.0).round() / 1000.0;

        let (nav_state, radical_state) = if angle_deg < 5.0 {
            ("AXIAL_MAGNETIC_LOCK".to_string(), CryptochromeRadicalState::EntangledActive)
        } else if is_aligned {
            ("MIGRATION_CORRECT_COURSE".to_string(), CryptochromeRadicalState::SingletCoherent)
        } else {
            ("SEVERE_DRIFT_COMPASS_REALIGNING".to_string(), CryptochromeRadicalState::TripletRecombined)
        };

        IntentAlignmentReport {
            angular_drift_deg: (angle_deg * 100.0).round() / 100.0,
            cosine_similarity: (cosine * 1000.0).round() / 1000.0,
            quantum_coherence_score: coherence,
            is_aligned,
            correction_heading: correction_vec,
            navigational_state: nav_state,
            radical_state,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cluster_n_perfect_alignment() {
        let mut cluster_n = ClusterN::default();
        let goal = vec![1.0, 0.0, 0.0];
        let curr = vec![1.0, 0.0, 0.0];
        let report = cluster_n.compute_intent_heading(&goal, &curr);

        assert!(report.is_aligned);
        assert_eq!(report.angular_drift_deg, 0.0);
        assert_eq!(report.cosine_similarity, 1.0);
        assert_eq!(report.navigational_state, "AXIAL_MAGNETIC_LOCK");
    }

    #[test]
    fn test_cluster_n_drift_detection_and_correction() {
        let mut cluster_n = ClusterN::new(0.05, 20.0);
        let goal = vec![1.0, 0.0, 0.0];
        let curr = vec![0.0, 1.0, 0.0]; // 90 degrés de dérive orthogonale
        let report = cluster_n.compute_intent_heading(&goal, &curr);

        assert!(!report.is_aligned);
        assert_eq!(report.angular_drift_deg, 90.0);
        assert_eq!(report.cosine_similarity, 0.0);
        assert_eq!(report.navigational_state, "SEVERE_DRIFT_COMPASS_REALIGNING");
        assert_eq!(report.correction_heading, vec![2.0, -1.0, 0.0]);
    }
}
