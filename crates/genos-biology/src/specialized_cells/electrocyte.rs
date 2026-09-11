use serde::{Deserialize, Serialize};

/// Cellule musculaire/nerveuse modifiée formant une micro-batterie biologique
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Electrocyte {
    pub id: String,
    pub resting_potential_mv: f64,
    pub active_potential_mv: f64,
    pub is_depolarized: bool,
    pub current_output_ma: f64,
    pub atp_cost_per_pulse: f64,
}

impl Electrocyte {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            resting_potential_mv: -85.0,
            active_potential_mv: 65.0,
            is_depolarized: false,
            current_output_ma: 1.0,
            atp_cost_per_pulse: 0.5,
        }
    }

    /// Calcule le gradient transmembranaire disponible ($\Delta V \approx 150\,\text{mV}$)
    pub fn potential_gradient_mv(&self) -> f64 {
        self.active_potential_mv - self.resting_potential_mv
    }

    /// Dépolarisation unilatérale de la face innervée
    pub fn depolarize(&mut self) -> f64 {
        if !self.is_depolarized {
            self.is_depolarized = true;
            self.potential_gradient_mv()
        } else {
            0.0
        }
    }

    /// Repolarisation via pompes $Na^+/K^+$ ATP-dépendantes
    pub fn repolarize(&mut self, available_atp: f64) -> Result<f64, String> {
        if !self.is_depolarized {
            return Ok(available_atp);
        }
        if available_atp < self.atp_cost_per_pulse {
            return Err("ATP insuffisant pour repolariser l'électrocyte".to_string());
        }
        self.is_depolarized = false;
        Ok(available_atp - self.atp_cost_per_pulse)
    }
}

/// Résultat d'une décharge électrique synchrone
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElectricShockBurst {
    pub total_voltage_v: f64,
    pub total_current_a: f64,
    pub peak_power_watts: f64,
    pub active_columns: usize,
    pub latency_ms: f64,
    pub consensus_unlocked: bool,
    pub status: String,
}

/// Organe électrique complet (empilement d'électrocytes en colonnes séries-parallèles)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElectricOrganStack {
    pub organ_id: String,
    pub electrocytes: Vec<Electrocyte>,
    pub parallel_columns: usize,
    pub voltage_quorum_threshold_v: f64,
}

impl ElectricOrganStack {
    pub fn new(organ_id: &str, total_cells: usize, parallel_columns: usize) -> Self {
        let cols = parallel_columns.max(1);
        let electrocytes = (0..total_cells)
            .map(|i| Electrocyte::new(&format!("{}_cell_{}", organ_id, i)))
            .collect();

        Self {
            organ_id: organ_id.to_string(),
            electrocytes,
            parallel_columns: cols,
            voltage_quorum_threshold_v: 400.0,
        }
    }

    /// Calcule le potentiel total en série ($\sum V_i$)
    pub fn calculate_theoretical_voltage(&self) -> f64 {
        if self.electrocytes.is_empty() {
            return 0.0;
        }
        let cells_per_column = (self.electrocytes.len() / self.parallel_columns).max(1);
        let sample_cell = &self.electrocytes[0];
        (cells_per_column as f64 * sample_cell.potential_gradient_mv()) / 1000.0
    }

    /// Décharge synchrone instantanée de tout l'empilement
    pub fn discharge_burst(&mut self) -> Result<ElectricShockBurst, String> {
        let ready_count = self.electrocytes.iter().filter(|c| !c.is_depolarized).count();
        if ready_count == 0 {
            return Err("Organe électrique épuisé. Toutes les cellules sont dépolarisées.".to_string());
        }

        let _cells_per_column = (ready_count / self.parallel_columns).max(1);
        let mut total_mv = 0.0;
        for (i, cell) in self.electrocytes.iter_mut().enumerate() {
            if i % self.parallel_columns == 0 {
                total_mv += cell.depolarize();
            } else {
                cell.depolarize();
            }
        }

        let total_voltage_v = total_mv / 1000.0;
        let total_current_a = (self.parallel_columns as f64 * 1.0) / 1000.0; // 1 mA par colonne
        let power_watts = total_voltage_v * total_current_a;
        let consensus_unlocked = total_voltage_v >= self.voltage_quorum_threshold_v;

        Ok(ElectricShockBurst {
            total_voltage_v: (total_voltage_v * 100.0).round() / 100.0,
            total_current_a: (total_current_a * 1000.0).round() / 1000.0,
            peak_power_watts: (power_watts * 100.0).round() / 100.0,
            active_columns: self.parallel_columns,
            latency_ms: 0.15,
            consensus_unlocked,
            status: if consensus_unlocked {
                "MASSIVE_DISCHARGE_CONSENSUS_REACHED".to_string()
            } else {
                "SUB_QUORUM_DISCHARGE".to_string()
            },
        })
    }

    /// Repolarise l'ensemble de l'organe avec un pool global d'ATP
    pub fn recharge_all(&mut self, mut atp_pool: f64) -> Result<f64, String> {
        for cell in &mut self.electrocytes {
            if cell.is_depolarized {
                atp_pool = cell.repolarize(atp_pool)?;
            }
        }
        Ok(atp_pool)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_electrocyte_series_voltage_summation() {
        // 5000 cellules en série (comme chez l'anguille électrique Electrophorus electricus)
        // 5000 cellules * 150 mV = 750 Volts théoriques
        let mut electric_organ = ElectricOrganStack::new("electric_eel_organ", 5000, 1);
        let theoretical_v = electric_organ.calculate_theoretical_voltage();
        assert_eq!(theoretical_v, 750.0);

        // Décharge synchrone
        let burst = electric_organ.discharge_burst().expect("Burst success");
        assert_eq!(burst.total_voltage_v, 750.0);
        assert!(burst.consensus_unlocked);
        assert_eq!(burst.status, "MASSIVE_DISCHARGE_CONSENSUS_REACHED");

        // Deuxième décharge impossible sans recharge
        let second_burst = electric_organ.discharge_burst();
        assert!(second_burst.is_err());

        // Recharge avec ATP (5000 * 0.5 = 2500 ATP requis)
        let remaining_atp = electric_organ.recharge_all(3000.0).expect("Recharge ok");
        assert_eq!(remaining_atp, 500.0);

        // Décharge à nouveau fonctionnelle
        let reloaded_burst = electric_organ.discharge_burst().expect("Burst success after recharge");
        assert_eq!(reloaded_burst.total_voltage_v, 750.0);
    }

    #[test]
    fn test_sub_quorum_electrocyte() {
        // Seulement 1000 cellules -> 150 Volts < seuil de 400V
        let mut small_organ = ElectricOrganStack::new("torpedo_ray_organ", 1000, 1);
        let burst = small_organ.discharge_burst().expect("Burst success");
        assert_eq!(burst.total_voltage_v, 150.0);
        assert!(!burst.consensus_unlocked);
        assert_eq!(burst.status, "SUB_QUORUM_DISCHARGE");
    }
}
