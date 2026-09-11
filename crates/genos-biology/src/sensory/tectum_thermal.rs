use serde::{Deserialize, Serialize};

/// Cible identifiée par fusion synesthésique (optique + thermique) dans le tectum
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SynestheticTarget {
    pub target_locus: String,
    pub visual_complexity: f64,
    pub thermal_intensity: f64,
    pub composite_energy_score: f64,
    pub strike_confidence: f64,
    pub is_critical_hotspot: bool,
    pub priority_rank: usize,
}

/// Carte de fusion multimodale en temps réel (Tectum Optique)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TectumThermalMap {
    pub ambient_thermal_baseline: f64,
    pub max_thermal_gradient: f64,
    pub hotspots_count: usize,
    pub fused_targets: Vec<SynestheticTarget>,
    pub primary_strike_target: Option<String>,
}

/// Tectum Optique Modifié avec innervation des fossettes infrarouges
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TectumOpticum {
    pub thermal_sensitivity_mk: f64,
    pub fusion_weight_alpha: f64,
    pub hotspot_threshold: f64,
    pub strikes_history_count: usize,
}

impl Default for TectumOpticum {
    fn default() -> Self {
        Self::new(3.0, 0.65, 0.70)
    }
}

impl TectumOpticum {
    pub fn new(sensitivity_mk: f64, fusion_weight: f64, hotspot_threshold: f64) -> Self {
        Self {
            thermal_sensitivity_mk: sensitivity_mk.max(0.1),
            fusion_weight_alpha: fusion_weight.clamp(0.0, 1.0),
            hotspot_threshold: hotspot_threshold.clamp(0.1, 1.0),
            strikes_history_count: 0,
        }
    }

    /// Fusionne directement les flux structurels/visuels (ex: complexité AST) et thermiques (ex: métriques CPU/churn)
    pub fn fuse_modalities(
        &mut self,
        visual_nodes: &[(String, f64)],
        thermal_readings: &[(String, f64)],
    ) -> TectumThermalMap {
        self.strikes_history_count += 1;

        if visual_nodes.is_empty() && thermal_readings.is_empty() {
            return TectumThermalMap {
                ambient_thermal_baseline: 0.0,
                max_thermal_gradient: 0.0,
                hotspots_count: 0,
                fused_targets: Vec::new(),
                primary_strike_target: None,
            };
        }

        let mut thermal_map = std::collections::HashMap::new();
        for (locus, temp) in thermal_readings {
            thermal_map.insert(locus.clone(), *temp);
        }

        let mut fused = Vec::new();
        let mut max_gradient = 0.0;
        let mut sum_thermal = 0.0;

        for (locus, visual_score) in visual_nodes {
            let thermal_score = thermal_map.get(locus).cloned().unwrap_or(0.0);
            sum_thermal += thermal_score;
            if thermal_score > max_gradient {
                max_gradient = thermal_score;
            }

            // Score composite synesthésique = alpha * thermal + (1 - alpha) * visual
            let composite = (self.fusion_weight_alpha * thermal_score)
                + ((1.0 - self.fusion_weight_alpha) * visual_score);

            let confidence = (composite * (1.0 + (thermal_score * 0.2))).clamp(0.0, 1.0);
            let is_critical = composite >= self.hotspot_threshold || thermal_score >= 0.85;

            fused.push(SynestheticTarget {
                target_locus: locus.clone(),
                visual_complexity: ((visual_score * 1000.0).round()) / 1000.0,
                thermal_intensity: ((thermal_score * 1000.0).round()) / 1000.0,
                composite_energy_score: ((composite * 1000.0).round()) / 1000.0,
                strike_confidence: ((confidence * 1000.0).round()) / 1000.0,
                is_critical_hotspot: is_critical,
                priority_rank: 0,
            });
        }

        // Tri par score d'énergie décroissant pour établir le rang de priorité
        fused.sort_by(|a, b| b.composite_energy_score.partial_cmp(&a.composite_energy_score).unwrap_or(std::cmp::Ordering::Equal));
        for (idx, target) in fused.iter_mut().enumerate() {
            target.priority_rank = idx + 1;
        }

        let baseline = if !fused.is_empty() {
            sum_thermal / (fused.len() as f64)
        } else {
            0.0
        };

        let hotspots_count = fused.iter().filter(|t| t.is_critical_hotspot).count();
        let primary_target = fused.first().map(|t| t.target_locus.clone());

        TectumThermalMap {
            ambient_thermal_baseline: (baseline * 1000.0).round() / 1000.0,
            max_thermal_gradient: (max_gradient * 1000.0).round() / 1000.0,
            hotspots_count,
            fused_targets: fused,
            primary_strike_target: primary_target,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tectum_thermal_fusion() {
        let mut tectum = TectumOpticum::new(3.0, 0.7, 0.65);
        let visual = vec![
            ("src/auth.rs".to_string(), 0.8),
            ("src/cache.rs".to_string(), 0.2),
            ("src/db.rs".to_string(), 0.5),
        ];
        let thermal = vec![
            ("src/auth.rs".to_string(), 0.9), // Hotspot majeur
            ("src/cache.rs".to_string(), 0.1),
            ("src/db.rs".to_string(), 0.4),
        ];

        let map = tectum.fuse_modalities(&visual, &thermal);

        assert_eq!(map.hotspots_count, 1);
        assert_eq!(map.primary_strike_target, Some("src/auth.rs".to_string()));
        let top = &map.fused_targets[0];
        assert_eq!(top.target_locus, "src/auth.rs");
        assert!(top.is_critical_hotspot);
        assert_eq!(top.priority_rank, 1);
        assert!(top.composite_energy_score > 0.8);
    }
}
