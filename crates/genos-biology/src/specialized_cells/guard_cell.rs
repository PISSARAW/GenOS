use serde::{Deserialize, Serialize};

/// Résultat du throttling osmotique appliqué à un flux entrant
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThrottleResult {
    pub pore_aperture_ratio: f64,
    pub requested_flux: f64,
    pub admitted_flux: f64,
    pub throttled_flux: f64,
    pub backpressure_active: bool,
    pub stomatal_conductance_mol_m2_s: f64,
    pub status: String,
}

/// Cellule de garde végétale individuelle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardCell {
    pub id: String,
    pub turgor_pressure_mpa: f64, // Pression de turgescence (0.0 à 4.0 MPa)
    pub potassium_k_mm: f64,      // Concentration intracellulaire en K+ (100 à 800 mM)
    pub abscisic_acid_aba: f64,   // Hormone de stress ABA (0.0 = sérénité, 1.0 = sécheresse aiguë)
}

impl GuardCell {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            turgor_pressure_mpa: 2.5,
            potassium_k_mm: 450.0,
            abscisic_acid_aba: 0.1,
        }
    }

    /// Gonflement / Dégonflement osmotique en fonction de l'eau (tokens/mémoire) et de l'ABA
    pub fn update_osmosis(&mut self, resource_availability: f64, stress_hormone: f64) {
        self.abscisic_acid_aba = stress_hormone.clamp(0.0, 1.0);
        
        // L'ABA déclenche la fuite des ions K+ et la perte d'eau
        let aba_penalty = 1.0 - (self.abscisic_acid_aba * 0.85);
        let target_k = (resource_availability.clamp(0.0, 1.0) * 800.0 * aba_penalty).max(50.0);
        self.potassium_k_mm = target_k;

        // La pression de turgescence dépend directement de la concentration en solutés K+
        self.turgor_pressure_mpa = ((self.potassium_k_mm / 800.0) * 4.0 * aba_penalty * 100.0).round() / 100.0;
    }
}

/// Stomate complet formé d'une paire de cellules de garde encadrant un pore
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StomatalPore {
    pub pore_id: String,
    pub left_cell: GuardCell,
    pub right_cell: GuardCell,
    pub max_aperture_um: f64,
}

impl StomatalPore {
    pub fn new(pore_id: &str) -> Self {
        Self {
            pore_id: pore_id.to_string(),
            left_cell: GuardCell::new(&format!("{}_left", pore_id)),
            right_cell: GuardCell::new(&format!("{}_right", pore_id)),
            max_aperture_um: 12.0,
        }
    }

    /// Calcule le ratio d'ouverture de l'ostiole $[0.0, 1.0]$
    pub fn calculate_aperture_ratio(&self) -> f64 {
        let avg_pressure = (self.left_cell.turgor_pressure_mpa + self.right_cell.turgor_pressure_mpa) / 2.0;
        let avg_aba = (self.left_cell.abscisic_acid_aba + self.right_cell.abscisic_acid_aba) / 2.0;

        // Le pore s'ouvre quand les cellules sont turgescentes (courbure des parois externes)
        // et se ferme hermétiquement sous stress ABA ou plasmolyse
        let raw_ratio = (avg_pressure / 3.5) * (1.0 - avg_aba * 0.9);
        (raw_ratio.clamp(0.0, 1.0) * 100.0).round() / 100.0
    }

    /// Conductance stomatique en $\text{mol}\cdot\text{m}^{-2}\cdot\text{s}^{-1}$
    pub fn stomatal_conductance(&self) -> f64 {
        let ratio = self.calculate_aperture_ratio();
        (ratio * 0.45 * 1000.0).round() / 1000.0
    }

    /// Met à jour les deux cellules de garde
    pub fn regulate(&mut self, resource_availability: f64, stress_aba: f64) -> f64 {
        self.left_cell.update_osmosis(resource_availability, stress_aba);
        self.right_cell.update_osmosis(resource_availability, stress_aba);
        self.calculate_aperture_ratio()
    }

    /// Applique le throttling de flux (backpressure stomatique)
    pub fn throttle_flux(&self, requested_flux: f64) -> ThrottleResult {
        let aperture = self.calculate_aperture_ratio();
        let admitted = ((requested_flux * aperture) * 100.0).round() / 100.0;
        let throttled = ((requested_flux - admitted) * 100.0).round() / 100.0;
        let is_backpressure = throttled > 0.0;

        let status = if aperture >= 0.85 {
            "STOMATA_FULLY_OPEN_MAX_THROUGHPUT".to_string()
        } else if aperture <= 0.10 {
            "STOMATA_CLOSED_DROUGHT_PROTECTION".to_string()
        } else {
            "STOMATA_OSMOTIC_THROTTLING_ACTIVE".to_string()
        };

        ThrottleResult {
            pore_aperture_ratio: aperture,
            requested_flux,
            admitted_flux: admitted,
            throttled_flux: throttled,
            backpressure_active: is_backpressure,
            stomatal_conductance_mol_m2_s: self.stomatal_conductance(),
            status,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_guard_cell_osmosis_and_aba_closure() {
        let mut pore = StomatalPore::new("stoma_leaf_1");

        // Conditions optimales : ressources 100%, stress 0% -> Pleine ouverture
        let aperture_optimal = pore.regulate(1.0, 0.0);
        assert!(aperture_optimal >= 0.85);
        let throttle_optimal = pore.throttle_flux(100.0);
        assert_eq!(throttle_optimal.admitted_flux, 100.0);
        assert_eq!(throttle_optimal.status, "STOMATA_FULLY_OPEN_MAX_THROUGHPUT");

        // Stress hydrique / OOM sévère : ressources 20%, stress ABA 95% -> Fermeture
        let aperture_drought = pore.regulate(0.2, 0.95);
        assert!(aperture_drought <= 0.10);
        let throttle_drought = pore.throttle_flux(100.0);
        assert!(throttle_drought.throttled_flux >= 90.0);
        assert_eq!(throttle_drought.status, "STOMATA_CLOSED_DROUGHT_PROTECTION");
        assert!(throttle_drought.backpressure_active);
    }
}
