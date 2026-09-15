//! Pont entre la chimie réelle de la membrane lipidique (`lipid_membrane`)
//! et l'intégrité abstraite de [`crate::autopoiesis::Membrane`] : la
//! réparation de membrane consomme de l'ATP réel, synthétise réellement des
//! phospholipides (bilan de matière vérifié) et ne restaure l'intégrité
//! qu'à hauteur de ce qui a été réellement construit — pas un flottant qui
//! se recharge de lui-même.

use crate::GenosEcosystem;
use genos_biology::lipid_membrane::{synthesize_phospholipids, MembraneSynthesisReport};

/// Combien d'intégrité de membrane correspond à une mole de phospholipide
/// réellement synthétisée (facteur de conversion documenté, cohérent avec
/// `repair(0.25)` historique pour un coût ATP de 5.0).
const INTEGRITY_PER_PHOSPHOLIPID_MOL: f64 = 0.5;
/// Coût ATP réel (budget abstrait) d'une tentative de synthèse membranaire.
const MEMBRANE_SYNTHESIS_ATP_COST: f64 = 5.0;

impl GenosEcosystem {
    /// Répare réellement la membrane : débite l'ATP du budget métabolique,
    /// fait tourner la chimie de synthèse phospholipidique (glycérol +
    /// acides gras + phosphate -> phosphatidate, bilan de matière vérifié),
    /// puis ne restaure l'intégrité qu'à proportion de la matière construite.
    /// Retourne `None` si l'ATP est insuffisant ou si les substrats sont
    /// épuisés (aucune réparation fictive).
    pub fn repair_membrane_via_lipogenesis(&mut self) -> Option<MembraneSynthesisReport> {
        if !self.orchestrator.metabolism.consume(MEMBRANE_SYNTHESIS_ATP_COST) {
            return None;
        }
        let report = synthesize_phospholipids(&mut self.orchestrator.lipid_chemistry, MEMBRANE_SYNTHESIS_ATP_COST).ok()?;
        let integrity_gain = report.phospholipids_built_mol * INTEGRITY_PER_PHOSPHOLIPID_MOL;
        self.orchestrator.membrane.repair(integrity_gain);
        Some(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lipogenesis_repair_consumes_atp_and_restores_real_integrity() {
        let mut eco = GenosEcosystem::new("Test");
        eco.orchestrator.membrane.integrity = 0.1;
        eco.orchestrator.membrane.semantic_integrity = 0.1;
        let atp_before = eco.orchestrator.metabolism.available();
        let report = eco.repair_membrane_via_lipogenesis().expect("ATP et substrats disponibles");
        assert!(report.phospholipids_built_mol > 0.0);
        assert!(eco.orchestrator.metabolism.available() < atp_before);
        assert!(eco.orchestrator.membrane.total_integrity() > 0.1);
    }

    #[test]
    fn lipogenesis_repair_fails_without_atp() {
        let mut eco = GenosEcosystem::new("Test");
        eco.orchestrator.metabolism.atp = 0.0;
        assert!(eco.repair_membrane_via_lipogenesis().is_none());
    }
}
