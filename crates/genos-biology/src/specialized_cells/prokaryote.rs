use serde::{Deserialize, Serialize};

/// Plasmide bactérien : micro-vecteur d'ADN circulaire autonome et transférable
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Plasmid {
    pub plasmid_id: String,
    pub skill_name: String,
    pub executable_payload: String,
    pub resistance_marker: String,
    pub copy_number: usize,
}

/// Rapport de Transfert Horizontal de Gènes (HGT / Conjugaison)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HgtTransferReport {
    pub donor_id: String,
    pub recipient_id: String,
    pub transferred_plasmid_id: String,
    pub pilus_connection_latency_ms: f64,
    pub horizontal_transfer_success: bool,
    pub status: String,
}

/// Résultat d'exécution d'un plasmide ultra-léger
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlasmidExecutionYield {
    pub plasmid_id: String,
    pub skill_name: String,
    pub execution_output: String,
    pub latency_micros: u64,
    pub nucleus_overhead_cost: f64, // 0.0 pour un procaryote acaryote
}

/// Micro-agent Procaryote acaryote (sans noyau, ADN libre, boot < 1ms)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProkaryoticAgent {
    pub id: String,
    pub circular_chromosome: Vec<String>, // ADN circulaire libre sans membrane nucléaire
    pub plasmids: Vec<Plasmid>,           // Plasmides transférables
    pub has_sex_pilus: bool,              // Pilus F de conjugaison
    pub generation: u32,
    pub is_competent_for_transformation: bool,
}

impl ProkaryoticAgent {
    pub fn new(id: &str) -> Self {
        Self {
            id: id.to_string(),
            circular_chromosome: vec![
                "CORE_METABOLISM".to_string(),
                "TRANSLATION_70S".to_string(),
                "BINARY_FISSION".to_string(),
            ],
            plasmids: Vec::new(),
            has_sex_pilus: true,
            generation: 0,
            is_competent_for_transformation: true,
        }
    }

    pub fn with_plasmid(mut self, plasmid: Plasmid) -> Self {
        self.plasmids.push(plasmid);
        self
    }

    /// Transfert horizontal de gènes (HGT) par conjugaison bactérienne directe de pair à pair
    pub fn conjugate_transfer_plasmid(
        &self,
        recipient: &mut ProkaryoticAgent,
        plasmid_id: &str,
    ) -> Result<HgtTransferReport, String> {
        if !self.has_sex_pilus {
            return Err("Donneur incapable de conjugaison (absence de pilus F)".to_string());
        }

        let plasmid_to_transfer = self.plasmids.iter()
            .find(|p| p.plasmid_id == plasmid_id)
            .cloned()
            .ok_or_else(|| format!("Plasmide '{}' non trouvé chez le donneur", plasmid_id))?;

        // Le receveur intègre le plasmide sans passer par l'orchestrateur central
        if !recipient.plasmids.iter().any(|p| p.plasmid_id == plasmid_id) {
            recipient.plasmids.push(plasmid_to_transfer.clone());
        }

        Ok(HgtTransferReport {
            donor_id: self.id.clone(),
            recipient_id: recipient.id.clone(),
            transferred_plasmid_id: plasmid_id.to_string(),
            pilus_connection_latency_ms: 0.85,
            horizontal_transfer_success: true,
            status: "HGT_CONJUGATION_COMPLETE_PEER_TO_PEER".to_string(),
        })
    }

    /// Transformation naturelle : absorption d'un plasmide libre dans l'environnement
    pub fn assimilate_transformation(&mut self, free_plasmid: Plasmid) -> bool {
        if self.is_competent_for_transformation && !self.plasmids.iter().any(|p| p.plasmid_id == free_plasmid.plasmid_id) {
            self.plasmids.push(free_plasmid);
            true
        } else {
            false
        }
    }

    /// Division binaire ultra-rapide (scissiparité sans mitose ni fuseau achromatique)
    pub fn binary_fission(&mut self) -> (ProkaryoticAgent, ProkaryoticAgent) {
        self.generation += 1;

        let daughter_a = ProkaryoticAgent {
            id: format!("{}_div_a_gen{}", self.id, self.generation),
            circular_chromosome: self.circular_chromosome.clone(),
            plasmids: self.plasmids.clone(),
            has_sex_pilus: self.has_sex_pilus,
            generation: self.generation,
            is_competent_for_transformation: self.is_competent_for_transformation,
        };

        let daughter_b = ProkaryoticAgent {
            id: format!("{}_div_b_gen{}", self.id, self.generation),
            circular_chromosome: self.circular_chromosome.clone(),
            plasmids: self.plasmids.clone(),
            has_sex_pilus: self.has_sex_pilus,
            generation: self.generation,
            is_competent_for_transformation: self.is_competent_for_transformation,
        };

        (daughter_a, daughter_b)
    }

    /// Exécution instantanée d'une compétence plasmidique sans overhead nucléaire
    pub fn execute_plasmid(&self, plasmid_id: &str) -> Option<PlasmidExecutionYield> {
        self.plasmids.iter().find(|p| p.plasmid_id == plasmid_id).map(|plasmid| {
            PlasmidExecutionYield {
                plasmid_id: plasmid.plasmid_id.clone(),
                skill_name: plasmid.skill_name.clone(),
                execution_output: format!("EXECUTED_SKILL_{}: {}", plasmid.skill_name, plasmid.executable_payload),
                latency_micros: 15,
                nucleus_overhead_cost: 0.0, // Zéro surcoût de noyau
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prokaryotic_hgt_conjugation_and_execution() {
        let plasmid = Plasmid {
            plasmid_id: "pResist_anti_injection".into(),
            skill_name: "ADVERSARIAL_INJECTION_DEFENSE".into(),
            executable_payload: "QUARANTINE_PAYLOAD_IMMEDIATELY".into(),
            resistance_marker: "AMPICILLIN_EQ_INJECTION_RESIST".into(),
            copy_number: 12,
        };

        let donor = ProkaryoticAgent::new("ecoli_donor").with_plasmid(plasmid.clone());
        let mut recipient = ProkaryoticAgent::new("archaea_recipient");

        assert_eq!(donor.plasmids.len(), 1);
        assert_eq!(recipient.plasmids.len(), 0);

        // Conjugaison directe de pair à pair
        let report = donor.conjugate_transfer_plasmid(&mut recipient, "pResist_anti_injection")
            .expect("HGT success");
        assert!(report.horizontal_transfer_success);
        assert_eq!(recipient.plasmids.len(), 1);

        // Exécution par le receveur
        let exec_yield = recipient.execute_plasmid("pResist_anti_injection").expect("Exec ok");
        assert_eq!(exec_yield.nucleus_overhead_cost, 0.0);
        assert_eq!(exec_yield.skill_name, "ADVERSARIAL_INJECTION_DEFENSE");

        // Division binaire
        let (d1, d2) = recipient.binary_fission();
        assert_eq!(d1.plasmids.len(), 1);
        assert_eq!(d2.plasmids.len(), 1);
        assert_eq!(d1.generation, 1);
    }
}
