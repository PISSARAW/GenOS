//! Membrane lipidique réelle : synthèse et dégradation de phospholipides via
//! des réactions chimiques équilibrées (glycérol + acides gras + phosphate),
//! coûtées en ATP réel, plus une perméabilité sélective dérivée de la
//! polarité moléculaire réelle — pas un flottant d'intégrité abstrait qui se
//! recharge tout seul.
//!
//! Réaction de synthèse (esterification glycérol/acides gras puis
//! phosphorylation), atomes réels et bilan vérifié par
//! [`crate::chemistry::MetabolicNetwork::add_reaction`] :
//! Glycerol (C3H8O3) + 2 PalmiticAcid (C16H32O2) + Pi (H3PO4)
//!   -> PhosphatidicAcid (C35H69O8P) + 3 Water.
//! C35 H75 O11 P1 des deux côtés : bilan de matière réel, pas approximé.

use crate::chemistry::{ChemError, Element, MetabolicNetwork, Molecule, Reaction, ReactionYield};

const GLYCEROL: &str = "glycerol";
const PALMITIC_ACID: &str = "palmitic_acid";
const PI: &str = "lipid_pi";
const WATER: &str = "lipid_water";
const PHOSPHATIDIC_ACID: &str = "phosphatidic_acid";
const ATP: &str = "lipid_atp";
const ADP: &str = "lipid_adp";

/// Capacité cible du bassin de phospholipides pour une bicouche "pleine"
/// (unité arbitraire de moles, sert de référence à [`bilayer_integrity`]).
pub const BILAYER_TARGET_MOL: f64 = 4.0;
/// Coût ATP réel (moles) pour activer une paire d'acides gras avant estérification.
const ATP_COST_PER_SYNTHESIS_MOL: f64 = 2.0;

fn register_species(net: &mut MetabolicNetwork) {
    use Element::{C, H, N, O, P};
    net.register_species(GLYCEROL, Molecule::new("Glycerol", &[(C, 3), (H, 8), (O, 3)], -668.5));
    net.register_species(PALMITIC_ACID, Molecule::new("PalmiticAcid", &[(C, 16), (H, 32), (O, 2)], -892.0));
    net.register_species(PI, Molecule::new("Pi", &[(H, 3), (O, 4), (P, 1)], -1288.0));
    net.register_species(WATER, Molecule::new("Water", &[(H, 2), (O, 1)], -285.8));
    net.register_species(
        PHOSPHATIDIC_ACID,
        Molecule::new("PhosphatidicAcid", &[(C, 35), (H, 69), (O, 8), (P, 1)], -1580.0),
    );
    net.register_species(ATP, Molecule::new("ATP", &[(C, 10), (H, 16), (N, 5), (O, 13), (P, 3)], -3619.0));
    net.register_species(ADP, Molecule::new("ADP", &[(C, 10), (H, 15), (N, 5), (O, 10), (P, 2)], -2626.0));
}

/// Estérification + phosphorylation réelles : matière du bilayer construite.
fn synthesis_reaction() -> Reaction {
    Reaction::new(
        "phospholipid_synthesis",
        &[(GLYCEROL, 1), (PALMITIC_ACID, 2), (PI, 1)],
        &[(PHOSPHATIDIC_ACID, 1), (WATER, 3)],
    )
}

/// Action de phospholipase réelle : hydrolyse la matière du bilayer, recyclant
/// glycérol/acides gras/phosphate vers les bassins (dégradation, pas une perte).
fn degradation_reaction() -> Reaction {
    Reaction::new(
        "phospholipid_degradation",
        &[(PHOSPHATIDIC_ACID, 1), (WATER, 3)],
        &[(GLYCEROL, 1), (PALMITIC_ACID, 2), (PI, 1)],
    )
}

/// Coût énergétique réel de l'activation des acides gras avant estérification.
fn activation_cost_reaction() -> Reaction {
    Reaction::new("lipid_activation_cost", &[(ATP, 1), (WATER, 1)], &[(ADP, 1), (PI, 1)])
}

/// Construit le réseau chimique de la membrane lipidique, cofacteurs et
/// substrats de départ pré-chargés (quantités catalytiques réutilisées en boucle).
pub fn build_lipid_membrane_network() -> MetabolicNetwork {
    let mut net = MetabolicNetwork::new();
    register_species(&mut net);
    net.add_reaction(synthesis_reaction()).expect("synthèse phospholipidique doit être équilibrée");
    net.add_reaction(degradation_reaction()).expect("dégradation phospholipidique doit être équilibrée");
    net.add_reaction(activation_cost_reaction()).expect("activation ATP doit être équilibrée");
    net.deposit(GLYCEROL, 8.0);
    net.deposit(PALMITIC_ACID, 16.0);
    net.deposit(PI, 8.0);
    net.deposit(WATER, 100.0);
    net
}

/// Bilan réel d'un cycle de synthèse membranaire : matière/énergie mesurées.
#[derive(Clone, Debug, Default)]
pub struct MembraneSynthesisReport {
    pub steps: Vec<ReactionYield>,
    pub phospholipids_built_mol: f64,
    pub atp_spent_mol: f64,
}

/// Synthétise réellement des phospholipides, limité par l'ATP disponible et
/// les substrats (glycérol/acides gras/phosphate) réellement en stock.
/// Débite `lipid_atp` du réseau lui-même : c'est à l'appelant de déposer au
/// préalable l'ATP réellement retiré du budget métabolique de l'organisme.
pub fn synthesize_phospholipids(net: &mut MetabolicNetwork, atp_available_mol: f64) -> Result<MembraneSynthesisReport, ChemError> {
    net.deposit(ATP, atp_available_mol.max(0.0));
    let activation = net.run_reaction("lipid_activation_cost", atp_available_mol / ATP_COST_PER_SYNTHESIS_MOL)?;
    let synthesis = net.run_reaction("phospholipid_synthesis", activation.extent_mol)?;
    Ok(MembraneSynthesisReport {
        phospholipids_built_mol: synthesis.extent_mol,
        atp_spent_mol: activation.extent_mol,
        steps: vec![activation, synthesis],
    })
}

/// Dégrade réellement une fraction du bilayer (lipolyse), recyclant la
/// matière vers les bassins pour une future resynthèse.
pub fn degrade_phospholipids(net: &mut MetabolicNetwork, extent_mol: f64) -> Result<ReactionYield, ChemError> {
    net.run_reaction("phospholipid_degradation", extent_mol)
}

/// Intégrité réelle de la bicouche : proportion du bassin de phospholipides
/// intacts par rapport à la capacité cible, bornée à [0, 1].
pub fn bilayer_integrity(net: &MetabolicNetwork) -> f64 {
    (net.quantity_mol(PHOSPHATIDIC_ACID) / BILAYER_TARGET_MOL).clamp(0.0, 1.0)
}

/// Perméabilité relative d'une espèce à travers la bicouche, dérivée de sa
/// polarité réelle (règle d'Overton simplifiée) : plus une molécule porte
/// d'hétéroatomes (O, N, P) par rapport à son carbone, moins elle traverse
/// librement une bicouche lipidique — les molécules chargées/phosphorylées
/// comme l'ATP nécessitent des transporteurs, pas la diffusion passive.
pub fn relative_permeability(molecule: &Molecule) -> f64 {
    let count = |el: Element| -> f64 {
        molecule.formula.iter().find(|(e, _)| *e == el).map(|(_, n)| *n as f64).unwrap_or(0.0)
    };
    let carbon = count(Element::C).max(1.0);
    let polarity = (count(Element::O) + 3.0 * count(Element::N) + 5.0 * count(Element::P)) / carbon;
    (1.0 / (1.0 + polarity)).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_builds_with_balanced_reactions() {
        let _net = build_lipid_membrane_network();
    }

    #[test]
    fn synthesis_consumes_atp_and_builds_real_phospholipids() {
        let mut net = build_lipid_membrane_network();
        let report = synthesize_phospholipids(&mut net, 4.0).unwrap();
        assert!(report.phospholipids_built_mol > 0.0);
        assert!(report.atp_spent_mol > 0.0);
        assert!(bilayer_integrity(&net) > 0.0);
    }

    #[test]
    fn insufficient_atp_blocks_synthesis() {
        let mut net = build_lipid_membrane_network();
        let err = synthesize_phospholipids(&mut net, 0.0).unwrap_err();
        assert!(matches!(err, ChemError::InsufficientSubstrate(_)));
    }

    #[test]
    fn degradation_recycles_raw_material_for_resynthesis() {
        let mut net = build_lipid_membrane_network();
        let first = synthesize_phospholipids(&mut net, 4.0).unwrap();
        let glycerol_before = net.quantity_mol(GLYCEROL);
        let degraded = degrade_phospholipids(&mut net, first.phospholipids_built_mol).unwrap();
        assert!(degraded.extent_mol > 0.0);
        assert!(net.quantity_mol(GLYCEROL) > glycerol_before);
        // Après dégradation totale, une resynthèse redevient possible.
        let second = synthesize_phospholipids(&mut net, 4.0).unwrap();
        assert!(second.phospholipids_built_mol > 0.0);
    }

    #[test]
    fn polar_phosphorylated_species_permeate_less_than_pure_hydrocarbon() {
        let mut net = build_lipid_membrane_network();
        net.deposit(ATP, 0.0);
        register_species(&mut net);
        let palmitic = Molecule::new("PalmiticAcid", &[(Element::C, 16), (Element::H, 32), (Element::O, 2)], -892.0);
        let atp = Molecule::new("ATP", &[(Element::C, 10), (Element::H, 16), (Element::N, 5), (Element::O, 13), (Element::P, 3)], -3619.0);
        assert!(relative_permeability(&palmitic) > relative_permeability(&atp));
    }
}
