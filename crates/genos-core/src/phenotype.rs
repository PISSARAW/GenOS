use crate::genome::Genome;

#[derive(Clone, Debug, Default)]
pub struct EnvironmentalFactors {
    pub nutrition_quality: f64, // 0.0 to 1.0
    pub sun_uv_exposure: f64,   // 0.0 to 1.0
    pub specific_diet_pigments: bool, // e.g. Crevettes pour les flamants
}

#[derive(Clone, Debug, Default)]
pub struct Phenotype {
    // 1. Phénotype Macroscopique (Visible à l'oeil nu : Taille, couleur de peau, couleur des plumes)
    pub macroscopic_traits: Vec<String>,
    // 2. Phénotype Cellulaire (Forme au microscope : Globules rouges ronds ou en faucille)
    pub cellular_shape: String,
    // 3. Phénotype Moléculaire (Présence de protéines spécifiques : Groupe Sanguin A/B/O)
    pub molecular_markers: Vec<String>,
}

impl Phenotype {
    /// L'équation magique : Phénotype = Génotype + Environnement
    pub fn compute(genome: &Genome, env: &EnvironmentalFactors) -> Self {
        let mut traits = Vec::new();
        let mut shape = "Round (Normal)".to_string();
        let mut markers = Vec::new();

        // On lit l'ensemble des protéines exprimées par le génotype
        let mut expressed_proteins = Vec::new();
        for gene in genome.genes.values() {
            if let Ok(protein) = gene.express() {
                expressed_proteins.push(protein);
            }
        }

        // --- 1. L'exemple de la Taille (Macroscopique) ---
        // Le Génotype donne un potentiel. L'Environnement (nutrition) le réalise.
        let base_height = if expressed_proteins.contains(&"TALL_GENE".to_string()) { 190.0 } else { 170.0 };
        // Si malnutrition (nutrition = 0.0), la taille est bridée (190 -> ~95)
        let final_height = base_height * (0.5 + 0.5 * env.nutrition_quality);
        traits.push(format!("Height: {}cm", final_height as u32));

        // --- L'exemple du Bronzage (Macroscopique) ---
        // Le Génotype donne la couleur de base. L'Environnement (Soleil) la modifie.
        if expressed_proteins.contains(&"PALE_SKIN".to_string()) {
            if env.sun_uv_exposure > 0.7 {
                traits.push("Skin: Tanned (Darkened by UV)".to_string());
            } else {
                traits.push("Skin: Pale".to_string());
            }
        }

        // --- L'exemple des Flamants Roses (Macroscopique) ---
        // Génétiquement blancs, mais phénotypiquement roses si l'environnement fournit les pigments !
        if expressed_proteins.contains(&"PINK_BIRD".to_string()) {
            if env.specific_diet_pigments {
                traits.push("Feathers: Pink (Diet induced)".to_string());
            } else {
                traits.push("Feathers: White (Genetic baseline)".to_string());
            }
        }

        // --- 2. Phénotype Cellulaire (La Drépanocytose / Sickle Cell) ---
        // Mutation génétique qui déforme la cellule (visible au microscope)
        if expressed_proteins.contains(&"MUTATED_HEMOGLOBIN".to_string()) {
            shape = "Sickle (Faucille)".to_string();
        }

        // --- 3. Phénotype Moléculaire (Groupe Sanguin) ---
        // Présence de marqueurs invisibles à l'oeil nu
        let mut has_blood_antigen = false;
        if expressed_proteins.contains(&"ANTIGEN_A".to_string()) {
            markers.push("Blood_Antigen_A".to_string());
            has_blood_antigen = true;
        }
        if expressed_proteins.contains(&"ANTIGEN_B".to_string()) {
            markers.push("Blood_Antigen_B".to_string());
            has_blood_antigen = true;
        }
        if !has_blood_antigen {
            markers.push("Blood_O (No Antigens)".to_string());
        }

        Phenotype {
            macroscopic_traits: traits,
            cellular_shape: shape,
            molecular_markers: markers,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genome::Gene;
    
    #[test]
    fn test_phenotype_equation() {
        let mut genome = Genome::new("Default");
        
        // On injecte les gènes théoriques
        genome.genes.insert("HEIGHT".to_string(), Gene::new("LOC1", "TALL_GENE"));
        genome.genes.insert("SKIN".to_string(), Gene::new("LOC2", "PALE_SKIN"));
        genome.genes.insert("BIRD".to_string(), Gene::new("LOC3", "PINK_BIRD"));
        genome.genes.insert("BLOOD".to_string(), Gene::new("LOC4", "ANTIGEN_A"));

        // Environnement 1 : Malnutrition, pas de soleil, pas de crevettes
        let env_poor = EnvironmentalFactors {
            nutrition_quality: 0.0,
            sun_uv_exposure: 0.1,
            specific_diet_pigments: false,
        };

        let phenotype_poor = Phenotype::compute(&genome, &env_poor);
        assert!(phenotype_poor.macroscopic_traits.contains(&"Height: 95cm".to_string()));
        assert!(phenotype_poor.macroscopic_traits.contains(&"Skin: Pale".to_string()));
        assert!(phenotype_poor.macroscopic_traits.contains(&"Feathers: White (Genetic baseline)".to_string()));
        assert_eq!(phenotype_poor.cellular_shape, "Round (Normal)");
        assert!(phenotype_poor.molecular_markers.contains(&"Blood_Antigen_A".to_string()));

        // Environnement 2 : Bonne nutrition, soleil, et crevettes !
        let env_rich = EnvironmentalFactors {
            nutrition_quality: 1.0,
            sun_uv_exposure: 0.9,
            specific_diet_pigments: true,
        };

        let phenotype_rich = Phenotype::compute(&genome, &env_rich);
        assert!(phenotype_rich.macroscopic_traits.contains(&"Height: 190cm".to_string()));
        assert!(phenotype_rich.macroscopic_traits.contains(&"Skin: Tanned (Darkened by UV)".to_string()));
        assert!(phenotype_rich.macroscopic_traits.contains(&"Feathers: Pink (Diet induced)".to_string()));
    }
}
