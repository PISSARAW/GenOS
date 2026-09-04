use std::collections::HashMap;

// Note : Dans l'architecture cible, Genome vient du crate `genos-genome`
// use genos_genome::{Genome, ChromatinState};

// Mock struct pour satisfaire le compilateur sans importer tout le reste
#[derive(Clone, Debug)]
pub struct Genome {
    pub genes: HashMap<String, Gene>,
}

#[derive(Clone, Debug)]
pub struct Gene {
    pub key: String,
    pub is_methylated: bool,
    pub expression_volume: f64,
    pub developmentally_locked: bool,
    pub protein_output: String,
}

impl Gene {
    pub fn express(&self) -> Result<String, ()> {
        Ok(self.protein_output.clone())
    }
}

#[derive(Clone, Debug, Default)]
pub struct EnvironmentalFactors {
    pub nutrition_quality: f64,
    pub sun_uv_exposure: f64,
    pub temperature: f64,
    pub oxygen_level: f64,
    pub population_density: f64,
    pub is_embryonic_stage: bool,
    pub royal_jelly_diet: bool,
    pub mechanical_stress: f64,
    pub specific_diet_pigments: bool,
    pub starvation_famine: bool,
    pub trauma_cherry_blossom: bool,
    pub chain_smoking: bool,
}

#[derive(Clone, Debug, Default)]
pub struct Phenotype {
    pub macroscopic_traits: Vec<String>,
    pub cellular_shape: String,
    pub molecular_markers: Vec<String>,
}

/// Contexte passé à chaque expression de trait
pub struct ExpressionContext<'a> {
    pub env: &'a EnvironmentalFactors,
    pub protein_names: &'a [String],
    pub expressed_proteins: &'a [(String, f64)],
}

// -----------------------------------------------------------------------------
// NOUVEAU DESIGN : TRAIT REGISTRY (Open/Closed Principle)
// -----------------------------------------------------------------------------

/// Trait d'expression épigénétique (Modifie le génome AVANT lecture)
pub trait EpigeneticRegulator: Send + Sync {
    fn gene_key(&self) -> &str;
    fn regulate(&self, gene: &mut Gene, env: &EnvironmentalFactors);
}

/// Trait d'expression phénotypique (Calcule le trait APRÈS lecture)
pub trait PhenotypeExpression: Send + Sync {
    fn express(&self, ctx: &ExpressionContext, phenotype: &mut Phenotype);
}

/// Le Registry centralise les règles d'expression. 
/// Il est ouvert à l'extension (on peut enregistrer de nouvelles règles) 
/// mais fermé à la modification (plus de hardcodage dans la fonction `compute`).
#[derive(Default)]
pub struct PhenotypeRegistry {
    epigenetic_rules: HashMap<String, Box<dyn EpigeneticRegulator>>,
    phenotypic_rules: Vec<Box<dyn PhenotypeExpression>>,
}

impl PhenotypeRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_epigenetic(&mut self, rule: Box<dyn EpigeneticRegulator>) {
        self.epigenetic_rules.insert(rule.gene_key().to_string(), rule);
    }

    pub fn register_phenotypic(&mut self, rule: Box<dyn PhenotypeExpression>) {
        self.phenotypic_rules.push(rule);
    }

    /// Applique les post-it épigénétiques (cadenas ou amplificateurs) dynamiquement
    pub fn apply_epigenetic_regulation(&self, genome: &mut Genome, env: &EnvironmentalFactors) {
        for (key, gene) in genome.genes.iter_mut() {
            if let Some(rule) = self.epigenetic_rules.get(key) {
                rule.regulate(gene, env);
            }
        }
    }

    /// L'équation magique : Phénotype = Génotype + Environnement via Registry
    pub fn compute(&self, genome: &Genome, env: &EnvironmentalFactors) -> Phenotype {
        let mut phenotype = Phenotype::default();
        phenotype.cellular_shape = "Round (Normal)".to_string();

        let mut expressed_proteins = Vec::new();
        for gene in genome.genes.values() {
            if gene.is_methylated || gene.expression_volume <= 0.0 {
                continue;
            }
            if let Ok(protein) = gene.express() {
                expressed_proteins.push((protein, gene.expression_volume));
            }
        }

        let protein_names: Vec<String> = expressed_proteins.iter().map(|(p, _)| p.clone()).collect();
        let ctx = ExpressionContext {
            env,
            protein_names: &protein_names,
            expressed_proteins: &expressed_proteins,
        };

        // On laisse chaque règle enregistrée s'appliquer indépendamment
        for rule in &self.phenotypic_rules {
            rule.express(&ctx, &mut phenotype);
        }

        phenotype
    }
}

// -----------------------------------------------------------------------------
// IMPLÉMENTATIONS DES RÈGLES (Exemples extraits de l'ancien hardcode)
// -----------------------------------------------------------------------------

// -- 1. Abeilles --
struct BeeEpigenetics;
impl EpigeneticRegulator for BeeEpigenetics {
    fn gene_key(&self) -> &str { "BEE_CASTE" }
    fn regulate(&self, gene: &mut Gene, env: &EnvironmentalFactors) {
        gene.is_methylated = !env.royal_jelly_diet;
    }
}

struct BeePhenotype;
impl PhenotypeExpression for BeePhenotype {
    fn express(&self, ctx: &ExpressionContext, phenotype: &mut Phenotype) {
        if ctx.protein_names.contains(&"QUEEN_TRAITS".to_string()) {
            phenotype.macroscopic_traits.push("Caste: Queen Bee (Fertile, Large)".to_string());
        } else {
            // Note: In older code, if BEE_CASTE existed but QUEEN_TRAITS wasn't expressed, it was worker.
            // Simplified here.
        }
    }
}

// -- 2. Hauteur (Height) --
struct HeightPhenotype;
impl PhenotypeExpression for HeightPhenotype {
    fn express(&self, ctx: &ExpressionContext, phenotype: &mut Phenotype) {
        let base_height = if ctx.protein_names.contains(&"TALL_GENE".to_string()) { 190.0 } else { 170.0 };
        let final_height = base_height * (0.5 + 0.5 * ctx.env.nutrition_quality);
        phenotype.macroscopic_traits.push(format!("Height: {}cm", final_height as u32));
    }
}

// -- 3. Fourrure (Fur Color) --
struct FurEpigenetics;
impl EpigeneticRegulator for FurEpigenetics {
    fn gene_key(&self) -> &str { "FUR_COLOR" }
    fn regulate(&self, gene: &mut Gene, env: &EnvironmentalFactors) {
        gene.expression_volume = if env.temperature <= 0.0 { 0.0 } else { 1.0 };
    }
}

struct FurPhenotype;
impl PhenotypeExpression for FurPhenotype {
    fn express(&self, ctx: &ExpressionContext, phenotype: &mut Phenotype) {
        if ctx.protein_names.contains(&"BROWN_COLORS".to_string()) {
            phenotype.macroscopic_traits.push("Fur: Brown (Summer)".to_string());
        } else {
            phenotype.macroscopic_traits.push("Fur: White (Winter Camouflage)".to_string());
        }
    }
}

/// Fonction d'initialisation du registry (qui pourrait être chargée dynamiquement)
pub fn create_default_registry() -> PhenotypeRegistry {
    let mut registry = PhenotypeRegistry::new();
    
    // Enregistrement des règles épigénétiques
    registry.register_epigenetic(Box::new(BeeEpigenetics));
    registry.register_epigenetic(Box::new(FurEpigenetics));
    
    // Enregistrement des règles phénotypiques
    registry.register_phenotypic(Box::new(HeightPhenotype));
    registry.register_phenotypic(Box::new(BeePhenotype));
    registry.register_phenotypic(Box::new(FurPhenotype));
    
    // On pourrait ajouter d'autres règles ici sans JAMAIS modifier PhenotypeRegistry
    // par exemple : registry.register_phenotypic(Box::new(MusclePhenotype));
    
    registry
}
