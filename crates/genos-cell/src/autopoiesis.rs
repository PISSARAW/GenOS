use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MetabolicPool {
    /// Matière première disponible (ex: extraite de la digestion de données)
    pub amino_acids: f64,
    /// Déchets métaboliques accumulés (doivent être purgés)
    pub cellular_waste: f64,
    /// Niveau d'entropie structurelle (0.0 = parfait, 1.0 = mort)
    pub entropy_level: f64,
}

impl Default for MetabolicPool {
    fn default() -> Self {
        Self {
            amino_acids: 100.0,
            cellular_waste: 0.0,
            entropy_level: 0.0,
        }
    }
}

impl MetabolicPool {
    /// Simule le passage du temps (dégradation de la structure)
    pub fn apply_entropy(&mut self, time_delta: f64) {
        // L'entropie augmente naturellement avec le temps
        self.entropy_level = (self.entropy_level + 0.05 * time_delta).min(1.0);
    }

    /// Digère des données brutes pour extraire des acides aminés (matière première)
    pub fn metabolize_raw_data(&mut self, data_size: f64) {
        // Conversion de données en matière utilisable, génère des déchets
        let extracted = data_size * 0.8;
        let waste = data_size * 0.2;
        self.amino_acids += extracted;
        self.cellular_waste += waste;
    }

    /// Tente de réparer la structure (contrer l'entropie) en consommant la matière
    /// Renvoie l'énergie (ATP) consommée par le processus de réparation
    pub fn synthesize_repairs(&mut self) -> f64 {
        if self.entropy_level > 0.1 && self.amino_acids >= 10.0 {
            // Réparation
            let repair_amount = self.entropy_level.min(0.2); // Répare jusqu'à 0.2 d'entropie par cycle
            let cost_in_amino_acids = repair_amount * 50.0;
            
            if self.amino_acids >= cost_in_amino_acids {
                self.amino_acids -= cost_in_amino_acids;
                self.entropy_level = (self.entropy_level - repair_amount).max(0.0);
                return repair_amount * 20.0; // Coût en ATP
            }
        }
        0.0 // Aucun ATP consommé si pas de réparation
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_autopoiesis_entropy_and_repair() {
        let mut pool = MetabolicPool::default();
        pool.amino_acids = 0.0;
        
        // Le temps passe, l'entropie monte
        pool.apply_entropy(4.0);
        assert_eq!(pool.entropy_level, 0.2);

        // Pas d'acides aminés, pas de réparation
        let cost = pool.synthesize_repairs();
        assert_eq!(cost, 0.0);
        assert_eq!(pool.entropy_level, 0.2);

        // Digestion de données
        pool.metabolize_raw_data(50.0);
        assert_eq!(pool.amino_acids, 40.0);
        assert_eq!(pool.cellular_waste, 10.0);

        // Réparation réussie
        let cost = pool.synthesize_repairs();
        assert!(cost > 0.0);
        assert_eq!(pool.entropy_level, 0.0);
        assert_eq!(pool.amino_acids, 30.0); // 40.0 - (0.2 * 50.0) = 30.0
    }
}
