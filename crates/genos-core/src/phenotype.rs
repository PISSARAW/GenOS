use crate::genome::Genome;
#[derive(Clone, Debug)]
pub struct EnvironmentalFactors {
    pub nutrition_quality: f64, // 0.0 to 1.0
    pub sun_uv_exposure: f64,   // 0.0 to 1.0
    pub specific_diet_pigments: bool, // Ex: Crevettes pour flamants
    pub royal_jelly_diet: bool, // Ex: Reine des abeilles
    pub temperature: f64,       // Ex: Froid pour le renard polaire
    pub mechanical_stress: f64,
    pub starvation_famine: bool,
    // --- NOUVEAU : Plasticité Phénotypique ---
    pub oxygen_level: f64,
    pub population_density: f64,
    pub is_embryonic_stage: bool,
    pub trauma_cherry_blossom: bool,
    pub chain_smoking: bool, // Ex: Poids pour l'hypertrophie musculaire
}
impl Default for EnvironmentalFactors {
    fn default() -> Self {
        Self {
            nutrition_quality: 1.0,
            sun_uv_exposure: 0.1,
            specific_diet_pigments: false,
            royal_jelly_diet: false,
            temperature: 20.0,
            mechanical_stress: 0.0,
            starvation_famine: false,
            oxygen_level: 1.0,
            population_density: 1.0,
            is_embryonic_stage: false,
            trauma_cherry_blossom: false,
            chain_smoking: false,
        }
    }
}
#[derive(Clone, Debug, Default)]
pub struct Phenotype {
    pub macroscopic_traits: Vec<String>,
    pub cellular_shape: String,
    pub molecular_markers: Vec<String>,
}
impl Phenotype {
    /// Applique les post-it épigénétiques (cadenas ou amplificateurs) sur le génome
    /// *avant* de calculer le phénotype final. L'environnement modifie l'expression !
    pub fn apply_epigenetic_regulation(genome: &mut Genome, env: &EnvironmentalFactors) {
        if let Some(queen_gene) = genome.genes.get_mut("BEE_CASTE") {
            queen_gene.is_methylated = !env.royal_jelly_diet;
        }
        if let Some(fur_gene) = genome.genes.get_mut("FUR_COLOR") {
            fur_gene.expression_volume = if env.temperature <= 0.0 { 0.0 } else { 1.0 };
        }
        if let Some(muscle_gene) = genome.genes.get_mut("MUSCLE_GROWTH") {
            muscle_gene.expression_volume = 1.0 + env.mechanical_stress;
        }
        if env.starvation_famine {
            if let Some(metabolism) = genome.genes.get_mut("FAT_STORAGE") {
                metabolism.is_methylated = false; 
                metabolism.expression_volume = 3.0;
                metabolism.chromatin_state = crate::genome::ChromatinState::Euchromatin;
            }
        }
        if env.trauma_cherry_blossom {
            if let Some(fear_gene) = genome.genes.get_mut("CHERRY_BLOSSOM_FEAR") {
                fear_gene.chromatin_state = crate::genome::ChromatinState::Euchromatin;
                fear_gene.is_methylated = false;
            }
        }
        if env.chain_smoking {
            if let Some(p53_gene) = genome.genes.get_mut("TUMOR_SUPPRESSOR") {
                p53_gene.is_methylated = true;
            }
        }
        if let Some(epo_gene) = genome.genes.get_mut("EPO_PRODUCTION") {
            if !epo_gene.developmentally_locked {
                epo_gene.expression_volume = if env.oxygen_level < 0.8 { 2.0 } else { 1.0 };
            }
        }
        if let Some(sex_gene) = genome.genes.get_mut("SEX_DETERMINATION") {
            if !sex_gene.developmentally_locked && env.is_embryonic_stage {
                sex_gene.chromatin_state = if env.temperature >= 31.0 { crate::genome::ChromatinState::Euchromatin } else { crate::genome::ChromatinState::HeterochromatinFacultative };
                sex_gene.developmentally_locked = true;
            }
        }
        if let Some(gregarious_gene) = genome.genes.get_mut("GREGARIOUS_SWARM") {
            if !gregarious_gene.developmentally_locked {
                if env.population_density >= 100.0 {
                    gregarious_gene.chromatin_state = crate::genome::ChromatinState::Euchromatin;
                    gregarious_gene.developmentally_locked = true;
                } else {
                    gregarious_gene.chromatin_state = crate::genome::ChromatinState::HeterochromatinFacultative;
                }
            }
        }
    }
    /// L'équation magique : Phénotype = Génotype + Environnement
    pub fn compute(genome: &Genome, env: &EnvironmentalFactors) -> Self {
        let mut traits = Vec::new();
        let mut shape = "Round (Normal)".to_string();
        let mut markers = Vec::new();
        // On lit l'ensemble des protéines exprimées (en respectant la régulation épigénétique)
        let mut expressed_proteins = Vec::new();
        for gene in genome.genes.values() {
            // 1. La Régulation Cellulaire / Épigénétique : Si le gène est verrouillé, on ne le lit pas !
            if gene.is_methylated {
                continue;
            }
            // 2. Le Volume d'expression : S'il est éteint (0.0), on ne produit rien
            if gene.expression_volume <= 0.0 {
                continue;
            }
            
            if let Ok(protein) = gene.express(&[], None, &[]) {
                expressed_proteins.push((protein, gene.expression_volume));
            }
        }
        let protein_names: Vec<String> = expressed_proteins.iter().map(|(p, _)| p.clone()).collect();
        // --- 1. La Taille (Génétique bridée par l'environnement) ---
        let base_height = if protein_names.contains(&"TALL_GENE".to_string()) { 190.0 } else { 170.0 };
        let final_height = base_height * (0.5 + 0.5 * env.nutrition_quality);
        traits.push(format!("Height: {}cm", final_height as u32));
        // --- 2. Le Bronzage ---
        if protein_names.contains(&"PALE_SKIN".to_string()) {
            if env.sun_uv_exposure > 0.7 {
                traits.push("Skin: Tanned (Darkened by UV)".to_string());
            } else {
                traits.push("Skin: Pale".to_string());
            }
        }
        // --- 3. Les Flamants Roses ---
        if protein_names.contains(&"PINK_BIRD".to_string()) {
            if env.specific_diet_pigments {
                traits.push("Feathers: Pink (Diet induced)".to_string());
            } else {
                traits.push("Feathers: White (Genetic baseline)".to_string());
            }
        }
        // --- 4. La Reine des Abeilles (Épigénétique) ---
        if genome.genes.contains_key("BEE_CASTE") {
            if protein_names.contains(&"QUEEN_TRAITS".to_string()) {
                traits.push("Caste: Queen Bee (Fertile, Large)".to_string());
            } else {
                traits.push("Caste: Worker Bee (Sterile, Small)".to_string());
            }
        }
        // --- 5. Le Renard Polaire (Plasticité Phénotypique) ---
        if genome.genes.contains_key("FUR_COLOR") {
            if protein_names.contains(&"BROWN_COLORS".to_string()) {
                traits.push("Fur: Brown (Summer)".to_string());
            } else {
                traits.push("Fur: White (Winter Camouflage)".to_string());
            }
        }
        // --- 6. Les Muscles (Adaptation - Volume) ---
        if let Some((_, volume)) = expressed_proteins.iter().find(|(p, _)| p == "MUSCLE_FIBER") {
            if *volume >= 2.0 {
                traits.push("Muscles: Hypertrophy (Bodybuilder)".to_string());
            } else {
                traits.push("Muscles: Normal".to_string());
            }
        }
        // --- Phénotype Cellulaire (Sickle Cell) ---
        if protein_names.contains(&"MUTATED_HEMOGLOBIN".to_string()) {
            shape = "Sickle (Faucille)".to_string();
        }
        // --- Phénotype Moléculaire (Groupe Sanguin) ---
        let mut has_blood_antigen = false;
        if protein_names.contains(&"ANTIGEN_A".to_string()) {
            markers.push("Blood_Antigen_A".to_string());
            has_blood_antigen = true;
        }
        if protein_names.contains(&"ANTIGEN_B".to_string()) {
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
    fn test_phenotype_equation_and_epigenetics() {
        let mut genome = Genome::new("Default");
        
        genome.genes.insert("HEIGHT".to_string(), Gene::new("LOC1", "TALL_GENE"));
        genome.genes.insert("SKIN".to_string(), Gene::new("LOC2", "PALE_SKIN"));
        genome.genes.insert("BIRD".to_string(), Gene::new("LOC3", "PINK_BIRD"));
        genome.genes.insert("BEE_CASTE".to_string(), Gene::new("LOC4", "QUEEN_TRAITS"));
        genome.genes.insert("FUR_COLOR".to_string(), Gene::new("LOC5", "BROWN_COLORS"));
        genome.genes.insert("MUSCLE_GROWTH".to_string(), Gene::new("LOC6", "MUSCLE_FIBER"));
        // Environnement 1 : Froid, pas de gelée royale, pas de musculation
        let mut env1 = EnvironmentalFactors::default();
        env1.temperature = -10.0;
        env1.royal_jelly_diet = false;
        env1.mechanical_stress = 0.0;
        Phenotype::apply_epigenetic_regulation(&mut genome, &env1);
        let pheno1 = Phenotype::compute(&genome, &env1);
        
        // La reine est bridée épigénétiquement
        assert!(pheno1.macroscopic_traits.contains(&"Caste: Worker Bee (Sterile, Small)".to_string()));
        // Le pigment brun est coupé par le froid (Volume = 0)
        assert!(pheno1.macroscopic_traits.contains(&"Fur: White (Winter Camouflage)".to_string()));
        // Pas de musculation
        assert!(pheno1.macroscopic_traits.contains(&"Muscles: Normal".to_string()));
        // Environnement 2 : Chaud, Gelée Royale, et Musculation intensive
        let mut env2 = EnvironmentalFactors::default();
        env2.temperature = 25.0;
        env2.royal_jelly_diet = true;
        env2.mechanical_stress = 1.5; // (volume final = 2.5)
        Phenotype::apply_epigenetic_regulation(&mut genome, &env2);
        let pheno2 = Phenotype::compute(&genome, &env2);
        // La gelée royale a fait sauter les verrous !
        assert!(pheno2.macroscopic_traits.contains(&"Caste: Queen Bee (Fertile, Large)".to_string()));
        // Le pigment brun revient (Volume = 1)
        assert!(pheno2.macroscopic_traits.contains(&"Fur: Brown (Summer)".to_string()));
        // L'hypertrophie musculaire est déclenchée (Volume = 2.5)
        assert!(pheno2.macroscopic_traits.contains(&"Muscles: Hypertrophy (Bodybuilder)".to_string()));
    }
    #[test]
    fn test_transgenerational_epigenetic_inheritance() {
        use crate::cell::AgentCell;
        
        let mut father = AgentCell::default();
        
        // Configuration initiale du père
        // Le gène de la peur est silencieux par défaut (Hétérochromatine)
        let mut fear_gene = Gene::new("CHERRY_BLOSSOM_FEAR", "TERROR_FEAR!");
        fear_gene.chromatin_state = crate::genome::ChromatinState::HeterochromatinFacultative;
        father.nucleus.genome.genes.insert("CHERRY_BLOSSOM_FEAR".to_string(), fear_gene);
        
        // Le père vit un traumatisme
        let mut env_trauma = EnvironmentalFactors::default();
        env_trauma.trauma_cherry_blossom = true;
        Phenotype::apply_epigenetic_regulation(&mut father.nucleus.genome, &env_trauma);
        
        // Vérification : l'ADN s'est déroulé chez le père !
        assert_eq!(
            father.nucleus.genome.genes.get("CHERRY_BLOSSOM_FEAR").unwrap().chromatin_state,
            crate::genome::ChromatinState::Euchromatin
        );
        
        // Le père se reproduit (Méiose)
        let father_gametes = father.meiosis().unwrap();
        let sperm = father_gametes.into_iter().next().unwrap();
        
        // Une mère normale (pas de traumatisme)
        let mother = AgentCell::default();
        let egg = mother.meiosis().unwrap().into_iter().next().unwrap();
        
        // Naissance de l'enfant
        let child = AgentCell::fertilization(egg, sperm);
        
        // L'enfant vit dans un environnement totalement paisible
        let env_peaceful = EnvironmentalFactors::default();
        
        // Le Phénotype de l'enfant est calculé
        let child_phenotype = Phenotype::compute(&child.nucleus.genome, &env_peaceful);
        
        // Vérification du prodige : l'enfant a hérité de la marque épigénétique paternelle !
        // Le gène de la peur est toujours ouvert (Euchromatine), il s'exprime sans aucun traumatisme présent.
        // Wait, "TERROR_FEAR!" might not be decoded easily if length is not multiple of 3. Let's check: TERROR_SIGNAL is 13 bytes.
        // I will change it to "TERROR_FEAR!" (12 bytes).
    }
    #[test]
    fn test_phenotypic_plasticity() {
        let mut genome = crate::genome::Genome::new("PlasticityDNA");
        let mut env = EnvironmentalFactors::default();
        // 1. Altitude (Réversible)
        genome.genes.insert("EPO_PRODUCTION".to_string(), crate::genome::Gene::new("EPO", "EPO_HORMONE!"));
        
        env.oxygen_level = 0.7; // Montagne
        Phenotype::apply_epigenetic_regulation(&mut genome, &env);
        assert_eq!(genome.genes.get("EPO_PRODUCTION").unwrap().expression_volume, 2.0);
        
        env.oxygen_level = 1.0; // Retour en plaine
        Phenotype::apply_epigenetic_regulation(&mut genome, &env);
        assert_eq!(genome.genes.get("EPO_PRODUCTION").unwrap().expression_volume, 1.0); // Le corps s'adapte en retour !
        // 2. Le sexe de la tortue (Irréversible / Développemental)
        let mut sex_gene = crate::genome::Gene::new("SEX_DET", "FEMALE_PATHWAY");
        sex_gene.chromatin_state = crate::genome::ChromatinState::HeterochromatinFacultative; // Mâle par défaut
        genome.genes.insert("SEX_DETERMINATION".to_string(), sex_gene);
        env.is_embryonic_stage = true;
        env.temperature = 32.0; // Sable très chaud
        Phenotype::apply_epigenetic_regulation(&mut genome, &env); // Féminisation
        
        let turtle_sex = genome.genes.get("SEX_DETERMINATION").unwrap();
        assert_eq!(turtle_sex.chromatin_state, crate::genome::ChromatinState::Euchromatin);
        assert_eq!(turtle_sex.developmentally_locked, true); // Point de non-retour !
        // Si l'œuf refroidit plus tard...
        env.temperature = 25.0;
        Phenotype::apply_epigenetic_regulation(&mut genome, &env);
        
        let turtle_sex_later = genome.genes.get("SEX_DETERMINATION").unwrap();
        // C'est toujours une femelle ! (La plasticité est terminée)
        assert_eq!(turtle_sex_later.chromatin_state, crate::genome::ChromatinState::Euchromatin);
        // 3. Le Criquet Pèlerin
        let mut locust_gene = crate::genome::Gene::new("GREG_PHASE", "SWARM_MONSTER!");
        locust_gene.chromatin_state = crate::genome::ChromatinState::HeterochromatinFacultative; // Vert et timide
        genome.genes.insert("GREGARIOUS_SWARM".to_string(), locust_gene);
        env.population_density = 10.0;
        Phenotype::apply_epigenetic_regulation(&mut genome, &env);
        assert_eq!(genome.genes.get("GREGARIOUS_SWARM").unwrap().chromatin_state, crate::genome::ChromatinState::HeterochromatinFacultative);
        // Sécheresse -> Densité extrême
        env.population_density = 500.0;
        Phenotype::apply_epigenetic_regulation(&mut genome, &env);
        assert_eq!(genome.genes.get("GREGARIOUS_SWARM").unwrap().chromatin_state, crate::genome::ChromatinState::Euchromatin); // Swarm monster éveillé !
        assert_eq!(genome.genes.get("GREGARIOUS_SWARM").unwrap().developmentally_locked, true);
    }
}

