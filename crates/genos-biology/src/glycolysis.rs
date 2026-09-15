//! Voie glycolytique réelle : un réseau métabolique structuré de trois
//! réactions liées (glycolyse nette, régénération du NAD+ par fermentation,
//! hydrolyse de l'ATP pour le travail cellulaire), avec recyclage réel des
//! cofacteurs (ADP/ATP/Pi, NAD+/NADH) formant un cycle continu — pas un
//! scalaire abstrait qui se recharge tout seul.
//!
//! Les formules moléculaires sont réelles (glucose C6H12O6, ATP C10H16N5O13P3,
//! etc.) : le contrôle de bilan de matière de [`crate::chemistry`] les valide
//! effectivement lors de la construction du réseau.

use crate::chemistry::{ChemError, Element, MetabolicNetwork, Molecule, Reaction, ReactionYield};

const GLUCOSE: &str = "glucose";
const PYRUVATE: &str = "pyruvate";
const LACTATE: &str = "lactate";
const ADP: &str = "adp";
const ATP: &str = "atp";
const PI: &str = "pi";
const WATER: &str = "water";
const NAD_OX: &str = "nad_plus";
const NAD_RED: &str = "nadh";
const PROTON: &str = "proton";

fn register_species(net: &mut MetabolicNetwork) {
    use Element::{C, H, N, O, P};
    net.register_species(GLUCOSE, Molecule::new("Glucose", &[(C, 6), (H, 12), (O, 6)], -1273.3));
    net.register_species(PYRUVATE, Molecule::new("Pyruvate", &[(C, 3), (H, 4), (O, 3)], -607.0));
    net.register_species(LACTATE, Molecule::new("Lactate", &[(C, 3), (H, 6), (O, 3)], -687.0));
    net.register_species(ADP, Molecule::new("ADP", &[(C, 10), (H, 15), (N, 5), (O, 10), (P, 2)], -2626.0));
    net.register_species(ATP, Molecule::new("ATP", &[(C, 10), (H, 16), (N, 5), (O, 13), (P, 3)], -3619.0));
    net.register_species(PI, Molecule::new("Pi", &[(H, 3), (O, 4), (P, 1)], -1288.0));
    net.register_species(WATER, Molecule::new("Water", &[(H, 2), (O, 1)], -285.8));
    net.register_species(NAD_OX, Molecule::new("NAD+", &[(C, 21), (H, 27), (N, 7), (O, 14), (P, 2)], -1540.0));
    net.register_species(NAD_RED, Molecule::new("NADH", &[(C, 21), (H, 28), (N, 7), (O, 14), (P, 2)], -1601.0));
    net.register_species(PROTON, Molecule::new("H+", &[(H, 1)], 0.0));
}

/// Réaction nette de la glycolyse : Glucose + 2 ADP + 2 Pi + 2 NAD+ ->
/// 2 Pyruvate + 2 ATP + 2 NADH + 2 H+ + 2 H2O. C'est l'équation de bilan
/// standard de la biochimie ; le contrôle atomique la valide réellement.
fn glycolysis_net_reaction() -> Reaction {
    Reaction::new(
        "glycolysis_net",
        &[(GLUCOSE, 1), (ADP, 2), (PI, 2), (NAD_OX, 2)],
        &[(PYRUVATE, 2), (ATP, 2), (NAD_RED, 2), (PROTON, 2), (WATER, 2)],
    )
}

/// Fermentation lactique : régénère le NAD+ consommé par la glycolyse en
/// réduisant le pyruvate, fermant réellement la boucle du cofacteur redox.
fn fermentation_regeneration_reaction() -> Reaction {
    Reaction::new(
        "fermentation_regeneration",
        &[(PYRUVATE, 1), (NAD_RED, 1), (PROTON, 1)],
        &[(LACTATE, 1), (NAD_OX, 1)],
    )
}

/// Hydrolyse de l'ATP (travail cellulaire) : régénère l'ADP + Pi consommés
/// par la glycolyse, fermant la boucle du cofacteur énergétique.
fn atp_hydrolysis_reaction() -> Reaction {
    Reaction::new("atp_hydrolysis", &[(ATP, 1), (WATER, 1)], &[(ADP, 1), (PI, 1)])
}

/// Construit le réseau métabolique glycolytique complet, avec ses trois
/// réactions liées et leurs cofacteurs pré-chargés en quantité catalytique.
pub fn build_glycolysis_network() -> MetabolicNetwork {
    let mut net = MetabolicNetwork::new();
    register_species(&mut net);
    net.add_reaction(glycolysis_net_reaction()).expect("glycolysis_net doit être équilibrée");
    net.add_reaction(fermentation_regeneration_reaction()).expect("fermentation doit être équilibrée");
    net.add_reaction(atp_hydrolysis_reaction()).expect("hydrolyse ATP doit être équilibrée");
    // Cofacteurs et substrats de départ (quantités catalytiques réutilisées en boucle).
    net.deposit(ADP, 4.0);
    net.deposit(PI, 4.0);
    net.deposit(NAD_OX, 4.0);
    net.deposit(WATER, 100.0);
    net
}

/// Bilan agrégé d'un cycle métabolique continu : matière consommée/produite
/// et énergie nette réellement dégagée par la chaîne de réactions.
#[derive(Clone, Debug, Default)]
pub struct MetabolicCycleReport {
    pub steps: Vec<ReactionYield>,
    pub glucose_consumed_mol: f64,
    pub atp_produced_mol: f64,
    pub net_energy_released_kj: f64,
}

/// Fait tourner le cycle métabolique de façon continue : injecte du glucose,
/// exécute la glycolyse puis régénère immédiatement ses cofacteurs (NAD+ via
/// fermentation) tant que du substrat reste disponible, jusqu'à épuisement
/// réel du glucose déposé — un métabolisme physique, pas un scalaire qui se
/// recharge seul.
pub fn run_metabolic_cycle(net: &mut MetabolicNetwork, glucose_mol: f64) -> MetabolicCycleReport {
    net.deposit(GLUCOSE, glucose_mol);
    let mut report = MetabolicCycleReport::default();
    while net.quantity_mol(GLUCOSE) > 1e-9 {
        match run_one_turn(net) {
            Ok(turn) => accumulate_turn(&mut report, turn),
            Err(_) => break,
        }
    }
    report
}

fn run_one_turn(net: &mut MetabolicNetwork) -> Result<[ReactionYield; 3], ChemError> {
    let glycolysis = net.run_reaction("glycolysis_net", net.quantity_mol(GLUCOSE))?;
    let regeneration = net.run_reaction("fermentation_regeneration", glycolysis.extent_mol * 2.0)?;
    // Le travail cellulaire consomme l'ATP produit, régénérant ADP + Pi :
    // c'est ce recyclage réel des cofacteurs qui rend le cycle continu.
    let hydrolysis = net.run_reaction("atp_hydrolysis", net.quantity_mol(ATP))?;
    Ok([glycolysis, regeneration, hydrolysis])
}

fn accumulate_turn(report: &mut MetabolicCycleReport, turn: [ReactionYield; 3]) {
    for step in turn {
        report.net_energy_released_kj += step.energy_released_kj;
        if step.reaction == "glycolysis_net" {
            report.glucose_consumed_mol += step.extent_mol;
            report.atp_produced_mol += step.extent_mol * 2.0;
        }
        report.steps.push(step);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chemistry::verify_mass_conservation;

    #[test]
    fn network_builds_with_balanced_reactions() {
        let _net = build_glycolysis_network();
    }

    #[test]
    fn cycle_consumes_glucose_and_produces_atp_with_conserved_mass() {
        let mut net = build_glycolysis_network();
        let report = run_metabolic_cycle(&mut net, 3.0);
        assert!(report.glucose_consumed_mol > 0.0);
        assert!(report.atp_produced_mol > 0.0);
        assert!(net.quantity_mol(GLUCOSE) <= 1e-9);
        assert!(verify_mass_conservation(&report.steps));
        // La glycolyse nette est exothermique : de l'énergie réelle est dégagée.
        assert!(report.net_energy_released_kj > 0.0);
    }

    #[test]
    fn atp_hydrolysis_recycles_adp_and_pi() {
        let mut net = build_glycolysis_network();
        net.deposit(ATP, 1.0);
        let adp_before = net.quantity_mol(ADP);
        let pi_before = net.quantity_mol(PI);
        let hydrolysis = net.run_reaction("atp_hydrolysis", 1.0).unwrap();
        assert!(hydrolysis.extent_mol > 0.0);
        assert!(net.quantity_mol(ADP) > adp_before);
        assert!(net.quantity_mol(PI) > pi_before);
    }

    #[test]
    fn cofactors_are_recycled_across_repeated_cycles() {
        let mut net = build_glycolysis_network();
        let adp_before = net.quantity_mol(ADP);
        let _first = run_metabolic_cycle(&mut net, 2.0);
        let _second = run_metabolic_cycle(&mut net, 2.0);
        // ADP/Pi/NAD+ sont des cofacteurs catalytiques : leur quantité totale
        // revient proche de son niveau initial après chaque tour complet.
        assert!((net.quantity_mol(ADP) - adp_before).abs() < 1e-6);
    }
}
