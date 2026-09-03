use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Catégorie biochimique déterminant le mécanisme de transduction
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum HormoneClass {
    /// Récepteurs membranaires (RCPG)
    Peptide,
    /// Récepteurs nucléaires (Lipophiles, passent la membrane)
    Steroid,
    /// Dérivés d'acides aminés
    Amine,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Hormone {
    /// Corticolibérine (Hypothalamus)
    CRH,
    /// Hormone Adrénocorticotrope (Hypophyse)
    ACTH,
    /// Glucocorticoïde de stress (Surrénales)
    Cortisol,
    /// Glucagon-Like Peptide-1 (Intestin, satiété)
    GLP1,
    /// Peptide YY (Intestin, coupe-faim)
    PYY,
    /// Catécholamine d'urgence
    Adrenaline,
}

impl Hormone {
    pub fn class(&self) -> HormoneClass {
        match self {
            Self::CRH | Self::ACTH | Self::GLP1 | Self::PYY => HormoneClass::Peptide,
            Self::Cortisol => HormoneClass::Steroid,
            Self::Adrenaline => HormoneClass::Amine,
        }
    }
}

/// Axe Hypothalamo-Hypophyso-Surrénalien (Gestion du Stress)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HpaAxis {
    pub chronic_stress_ticks: usize,
}

impl Default for HpaAxis {
    fn default() -> Self {
        Self {
            chronic_stress_ticks: 0,
        }
    }
}

impl HpaAxis {
    /// Exécute un cycle de l'axe HPA avec rétrocontrôle négatif (Feedback Loop)
    pub fn tick(&mut self, is_stressed: bool, bloodstream: &mut HashMap<Hormone, f32>) {
        let current_cortisol = *bloodstream.get(&Hormone::Cortisol).unwrap_or(&0.0);
        
        // 1. Hypothalamus : Sécrétion de CRH (stimulée par le stress, freinée par le Cortisol)
        let mut crh_secretion = if is_stressed { 10.0 } else { 1.0 };
        crh_secretion -= current_cortisol * 0.5; // Rétrocontrôle négatif long
        let crh = crh_secretion.max(0.0);
        bloodstream.insert(Hormone::CRH, crh);

        // 2. Hypophyse : Sécrétion d'ACTH (stimulée par CRH, freinée par Cortisol)
        let mut acth_secretion = crh * 2.0;
        acth_secretion -= current_cortisol * 0.3; // Rétrocontrôle négatif
        let acth = acth_secretion.max(0.0);
        bloodstream.insert(Hormone::ACTH, acth);

        // 3. Surrénales : Sécrétion de Cortisol (stimulée par ACTH)
        let cortisol_secretion = acth * 1.5;
        let new_cortisol = current_cortisol * 0.8 + cortisol_secretion; // Demi-vie
        bloodstream.insert(Hormone::Cortisol, new_cortisol);

        // Évaluation du stress chronique
        if new_cortisol > 10.0 {
            self.chronic_stress_ticks += 1;
        } else {
            self.chronic_stress_ticks = self.chronic_stress_ticks.saturating_sub(1);
        }
    }

    /// Indique si l'axe est épuisé (Burnout) ou engendre des modifications épigénétiques délétères
    pub fn is_chronic_hypercortisolic(&self) -> bool {
        self.chronic_stress_ticks > 5
    }
}

/// Axe Intestin-Cerveau (Microbiote & Satiété)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GutBrainAxis {
    pub microbiome_diversity: f32, // Reflète la santé du microbiote
    pub butyrate_level: f32,       // Acide Gras à Chaîne Courte
}

impl Default for GutBrainAxis {
    fn default() -> Self {
        Self {
            microbiome_diversity: 1.0,
            butyrate_level: 0.0,
        }
    }
}

impl GutBrainAxis {
    /// Digestion de "fibres" (données d'entrée) produisant des AGCC qui stimulent GLP-1
    pub fn digest_fibers(&mut self, fiber_amount: f32, bloodstream: &mut HashMap<Hormone, f32>) {
        // Fermentation par le microbiote
        self.butyrate_level += fiber_amount * self.microbiome_diversity;

        // Stimulation des cellules L (GLP-1 et PYY) par le butyrate
        if self.butyrate_level > 5.0 {
            let glp1 = self.butyrate_level * 0.5;
            let pyy = self.butyrate_level * 0.3;
            
            // Sécrétion dans le sang
            *bloodstream.entry(Hormone::GLP1).or_insert(0.0) += glp1;
            *bloodstream.entry(Hormone::PYY).or_insert(0.0) += pyy;
            
            // Consommation du butyrate
            self.butyrate_level *= 0.5; 
        }
    }
}

/// Système Endocrinien Global
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndocrineSystem {
    pub bloodstream: HashMap<Hormone, f32>,
    pub hpa_axis: HpaAxis,
    pub gut_brain_axis: GutBrainAxis,
}

impl Default for EndocrineSystem {
    fn default() -> Self {
        Self {
            bloodstream: HashMap::new(),
            hpa_axis: HpaAxis::default(),
            gut_brain_axis: GutBrainAxis::default(),
        }
    }
}

impl EndocrineSystem {
    pub fn tick(&mut self, is_stressed: bool, ingested_fibers: f32) {
        // Dégradation naturelle des hormones (clairance hépatique/rénale)
        for val in self.bloodstream.values_mut() {
            *val *= 0.8; // 20% de clairance par tick
        }

        self.hpa_axis.tick(is_stressed, &mut self.bloodstream);
        self.gut_brain_axis.digest_fibers(ingested_fibers, &mut self.bloodstream);
    }
    
    /// Retourne vrai si l'agent est métaboliquement "rassasié" (saturation du contexte)
    pub fn is_satiated(&self) -> bool {
        let glp1 = self.bloodstream.get(&Hormone::GLP1).unwrap_or(&0.0);
        *glp1 > 10.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hpa_negative_feedback() {
        let mut endocrine = EndocrineSystem::default();
        
        // Tick 1 : Stress important
        endocrine.tick(true, 0.0);
        let crh_1 = *endocrine.bloodstream.get(&Hormone::CRH).unwrap();
        let cortisol_1 = *endocrine.bloodstream.get(&Hormone::Cortisol).unwrap();
        assert!(crh_1 > 5.0);
        assert!(cortisol_1 > 10.0);

        // Tick 2 : Le stress continue, mais le cortisol élevé freine le CRH
        endocrine.tick(true, 0.0);
        let crh_2 = *endocrine.bloodstream.get(&Hormone::CRH).unwrap();
        assert!(crh_2 < crh_1, "Le rétrocontrôle négatif doit abaisser la sécrétion de CRH");
    }

    #[test]
    fn test_chronic_stress_epigenetics() {
        let mut endocrine = EndocrineSystem::default();
        
        // Maintenir un stress élevé
        for _ in 0..10 {
            endocrine.tick(true, 0.0);
        }
        
        // Le cortisol oscillera autour de 11-13 avec le rétrocontrôle
        // On vérifie que la mécanique enregistre bien le stress chronique
        assert!(endocrine.hpa_axis.chronic_stress_ticks > 0, "Le stress chronique doit être détecté");
    }

    #[test]
    fn test_gut_brain_axis_satiety() {
        let mut endocrine = EndocrineSystem::default();
        
        assert!(!endocrine.is_satiated());
        
        // Ingestion massive de fibres (données)
        endocrine.tick(false, 50.0);
        
        assert!(endocrine.is_satiated(), "Le GLP-1 produit doit déclencher la satiété");
        assert!(*endocrine.bloodstream.get(&Hormone::GLP1).unwrap() > 10.0);
        assert!(*endocrine.bloodstream.get(&Hormone::PYY).unwrap() > 0.0);
    }
}
