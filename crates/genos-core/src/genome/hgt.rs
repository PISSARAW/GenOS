use serde::{Deserialize, Serialize};

/// Représente les Éléments Génétiques Mobiles (EGM) / Mobilome
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum MobileGeneticElement {
    /// Plasmide conjugatif : Transmis par contact direct (pilus / T4SS)
    ConjugativePlasmid { id: String, sequence: String, is_virulent: bool },
    /// Transposon : Capable de s'insérer aléatoirement
    Transposon { id: String, sequence: String },
    /// Vésicule membranaire (OMV) : Transport passif et protégé d'ADN
    Vesiduction(String),
    /// Prophage : Transduction virale
    ViralPhage { phage_id: String, payload_dna: String },
}

impl MobileGeneticElement {
    /// Simule la "richesse en AT" (Complexité étrangère d'un élément)
    /// Plus la séquence est longue/complexe, plus elle est considérée comme étrangère.
    pub fn foreignness_score(&self) -> usize {
        match self {
            Self::ConjugativePlasmid { sequence, .. } => sequence.len(),
            Self::Transposon { sequence, .. } => sequence.len() * 2,
            Self::Vesiduction(seq) => seq.len(),
            Self::ViralPhage { payload_dna, .. } => payload_dna.len() * 3, // Fortement étranger
        }
    }

    pub fn payload(&self) -> String {
        match self {
            Self::ConjugativePlasmid { sequence, .. } => sequence.clone(),
            Self::Transposon { sequence, .. } => sequence.clone(),
            Self::Vesiduction(seq) => seq.clone(),
            Self::ViralPhage { payload_dna, .. } => payload_dna.clone(),
        }
    }
}

/// Protéine de Silençage Xénogénique (ex: H-NS, Lsr2)
/// Protège l'hôte de l'expression toxique immédiate (fitness cost) de l'ADN étranger.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XenogeneicSilencer {
    /// Seuil de tolérance avant silençage (taille maximale tolérée sans silence)
    pub tolerance_threshold: usize,
    /// Liste des éléments actuellement réduits au silence
    pub silenced_elements: Vec<MobileGeneticElement>,
}

impl Default for XenogeneicSilencer {
    fn default() -> Self {
        Self {
            tolerance_threshold: 50, // Arbitraire
            silenced_elements: Vec::new(),
        }
    }
}

impl XenogeneicSilencer {
    /// Scanne l'élément entrant. S'il est trop "étrange", il est mis sous silence.
    pub fn scan_and_silence(&mut self, element: MobileGeneticElement) -> Result<String, String> {
        let score = element.foreignness_score();
        if score > self.tolerance_threshold {
            // Silençage actif : l'élément est absorbé mais non exprimé
            self.silenced_elements.push(element);
            Err(format!("🛑 [SILENÇAGE XÉNOGÉNIQUE] L'élément (Score: {}) a été réduit au silence pour préserver le fitness.", score))
        } else {
            // Toléré, peut être exprimé immédiatement
            Ok(element.payload())
        }
    }

    /// Mécanisme d'Anti-silençage : Dérépression sous conditions (ex: stress)
    pub fn derepress_element(&mut self, id_substring: &str) -> Option<String> {
        if let Some(pos) = self.silenced_elements.iter().position(|e| e.payload().contains(id_substring)) {
            let derepressed = self.silenced_elements.remove(pos);
            Some(derepressed.payload())
        } else {
            None
        }
    }
}

/// Moteur de Transfert Horizontal de Gènes (HGT)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HorizontalTransferEngine {
    pub silencer: XenogeneicSilencer,
    /// Compteur du fardeau génétique (Fitness Cost cumulé)
    pub fitness_cost: usize,
    /// Gènes/Prompts horizontalement intégrés et actifs
    pub active_foreign_genes: Vec<String>,
}

impl Default for HorizontalTransferEngine {
    fn default() -> Self {
        Self {
            silencer: XenogeneicSilencer::default(),
            fitness_cost: 0,
            active_foreign_genes: Vec::new(),
        }
    }
}

impl HorizontalTransferEngine {
    /// Acquisition de l'ADN étranger
    pub fn acquire_element(&mut self, element: MobileGeneticElement) -> Result<String, String> {
        let base_cost = element.foreignness_score() / 10; // Le simple fait de le porter coûte un peu d'énergie

        match self.silencer.scan_and_silence(element) {
            Ok(payload) => {
                // Expression immédiate = coût métabolique direct
                self.fitness_cost += base_cost * 5;
                self.active_foreign_genes.push(payload.clone());
                Ok(format!("🧬 [THG ACTIF] Compétence étrangère exprimée immédiatement. Fardeau augmenté (+{}).", base_cost * 5))
            }
            Err(silence_msg) => {
                // Silençage = coût minimal de maintenance
                self.fitness_cost += base_cost;
                Err(silence_msg)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xenogeneic_silencing() {
        let mut hte = HorizontalTransferEngine::default();
        
        // Petit élément : passe sous le radar
        let small_plasmid = MobileGeneticElement::ConjugativePlasmid {
            id: "pTINY".to_string(),
            sequence: "ABC".to_string(), // len 3, score 3 < 50
            is_virulent: false,
        };

        let result = hte.acquire_element(small_plasmid);
        assert!(result.is_ok());
        assert_eq!(hte.active_foreign_genes.len(), 1);

        // Élément massif (Phage) : Déclenche le silençage (H-NS)
        let massive_phage = MobileGeneticElement::ViralPhage {
            phage_id: "Phi-X".to_string(),
            payload_dna: "X".repeat(50), // len 50, score 150 > 50
        };

        let result2 = hte.acquire_element(massive_phage);
        assert!(result2.is_err()); // Silenced
        assert_eq!(hte.silencer.silenced_elements.len(), 1);
        assert_eq!(hte.active_foreign_genes.len(), 1); // Toujours 1 actif
    }

    #[test]
    fn test_derepression() {
        let mut hte = HorizontalTransferEngine::default();
        let massive_phage = MobileGeneticElement::ViralPhage {
            phage_id: "Phi-X".to_string(),
            payload_dna: "SECRET_SKILL".repeat(10), // score 120 * 3 = 360
        };

        assert!(hte.acquire_element(massive_phage).is_err());
        
        // Anti-silencing (ex: protéine Ler)
        let derepressed = hte.silencer.derepress_element("SECRET_SKILL");
        assert!(derepressed.is_some());
        assert_eq!(hte.silencer.silenced_elements.len(), 0);
    }
}
