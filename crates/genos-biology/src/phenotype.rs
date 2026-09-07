use std::collections::HashMap;
use genos_genome::{Gene, Genome};

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
    pub gene_keys: &'a [String],
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

        let mut regulated_genome = genome.clone();
        self.apply_epigenetic_regulation(&mut regulated_genome, env);
        let mut expressed_proteins = Vec::new();
        let mut protein_names = Vec::new();
        let active_tfs = Vec::new();
        let micro_rnas = Vec::new();
        for (locus, gene) in &regulated_genome.genes {
            let context = genos_genome::ExpressionContext {
                active_tfs: &active_tfs,
                alternative_splicing: None,
                micro_rnas: &micro_rnas,
            };
            if let Ok(protein) = gene.express(context) {
                expressed_proteins.push((protein.clone(), gene.expression_volume));
                protein_names.push(protein);
                protein_names.push(locus.clone());
                protein_names.push(gene.dna.decode_instruction());
            }
        }

        let gene_keys: Vec<String> = regulated_genome.genes.keys().cloned().collect();
        let ctx = ExpressionContext {
            env,
            protein_names: &protein_names,
            expressed_proteins: &expressed_proteins,
            gene_keys: &gene_keys,
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
        if ctx.gene_keys.iter().any(|k| k == "BEE_CASTE") {
            if ctx.protein_names.contains(&"QUEEN_TRAITS".to_string()) {
                phenotype.macroscopic_traits.push("Caste: Queen Bee (Fertile, Large)".to_string());
            } else {
                phenotype.macroscopic_traits.push("Caste: Worker Bee (Sterile)".to_string());
            }
        }
    }
}

// -- 2. Hauteur (Height) --
struct HeightPhenotype;
impl PhenotypeExpression for HeightPhenotype {
    fn express(&self, ctx: &ExpressionContext, phenotype: &mut Phenotype) {
        if ctx.gene_keys.iter().any(|k| k == "TALL_GENE" || k == "HEIGHT_GENE" || k == "HEIGHT") {
            let base_height = if ctx.protein_names.contains(&"TALL_GENE".to_string()) { 190.0 } else { 170.0 };
            let final_height = base_height * (0.5 + 0.5 * ctx.env.nutrition_quality);
            phenotype.macroscopic_traits.push(format!("Height: {}cm", final_height as u32));
        }
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
        if ctx.gene_keys.iter().any(|k| k == "FUR_COLOR") {
            if ctx.protein_names.contains(&"BROWN_COLORS".to_string()) {
                phenotype.macroscopic_traits.push("Fur: Brown (Summer)".to_string());
            } else {
                phenotype.macroscopic_traits.push("Fur: White (Winter Camouflage)".to_string());
            }
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
    
    registry
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_phenotype_fur_color_epigenetic_temperature() {
        let registry = create_default_registry();

        // 1. Organisme sans gène de fourrure -> pas de trait de fourrure
        let empty_genome = Genome::new("NO_FUR_ORGANISM");
        let pheno_empty = registry.compute(&empty_genome, &EnvironmentalFactors::default());
        assert!(!pheno_empty.macroscopic_traits.iter().any(|t| t.contains("Fur:")));

        // 2. Organisme avec FUR_COLOR en été (temp > 0)
        let mut summer_genome = Genome::new("HARE");
        summer_genome.insert_gene(Gene::new("FUR_COLOR", "BROWN_COLORS"));
        let summer_env = EnvironmentalFactors { temperature: 22.0, ..Default::default() };
        let pheno_summer = registry.compute(&summer_genome, &summer_env);
        assert!(pheno_summer.macroscopic_traits.iter().any(|t| t == "Fur: Brown (Summer)"));

        // 3. Organisme avec FUR_COLOR en hiver (temp <= 0)
        let mut winter_genome = Genome::new("HARE");
        winter_genome.insert_gene(Gene::new("FUR_COLOR", "BROWN_COLORS"));
        let winter_env = EnvironmentalFactors { temperature: -10.0, ..Default::default() };
        let pheno_winter = registry.compute(&winter_genome, &winter_env);
        assert!(pheno_winter.macroscopic_traits.iter().any(|t| t == "Fur: White (Winter Camouflage)"));
    }

    #[test]
    fn test_phenotype_bee_caste_epigenetics() {
        let registry = create_default_registry();
        let mut bee_genome = Genome::new("BEE");
        bee_genome.insert_gene(Gene::new("BEE_CASTE", "QUEEN_TRAITS"));

        // Royal jelly -> Queen
        let queen_env = EnvironmentalFactors { royal_jelly_diet: true, ..Default::default() };
        let pheno_queen = registry.compute(&bee_genome, &queen_env);
        assert!(pheno_queen.macroscopic_traits.iter().any(|t| t.contains("Queen Bee")));

        // No royal jelly -> Worker (methylated gene represses expression)
        let worker_env = EnvironmentalFactors { royal_jelly_diet: false, ..Default::default() };
        let pheno_worker = registry.compute(&bee_genome, &worker_env);
        assert!(pheno_worker.macroscopic_traits.iter().any(|t| t.contains("Worker Bee")));
    }
}
