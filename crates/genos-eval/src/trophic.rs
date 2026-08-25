//! Trophic networks and ecological succession.
//!
//! Extends the niche-competition model (`ecosystem.rs`) with:
//! - **Trophic networks**: who eats whom, with Lotka's ~10% energy-transfer
//!   efficiency between levels. A predator population cannot exceed what its
//!   prey biomass can sustain — a hard coexistence constraint.
//! - **Ecological succession**: an ecosystem progresses through pioneer,
//!   grassland, shrubland and climax stages as accumulated biomass grows;
//!   any disturbance resets it toward the pioneer stage.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Rendement énergétique moyen entre niveaux trophiques (loi de Lindeman).
pub const ENERGY_TRANSFER_EFFICIENCY: f64 = 0.10;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrophicRole {
    /// Produit la biomasse de base (agents outilleurs/compilateurs).
    Producer,
    /// Consomme les producteurs.
    Consumer,
    /// Consomme d'autres consommateurs.
    Predator,
    /// Recycle la matière morte (Cleaner/DLQ).
    Decomposer,
}

/// Un lien prédateur -> proie avec son efficacité de capture.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrophicLink {
    pub consumer: String,
    pub resource: String,
    pub efficiency: f64,
}

/// Réseau trophique : nœuds typés + liens de consommation.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct TrophicNetwork {
    pub roles: BTreeMap<String, TrophicRole>,
    pub links: Vec<TrophicLink>,
}

impl TrophicNetwork {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_species(&mut self, name: &str, role: TrophicRole) {
        self.roles.insert(name.to_string(), role);
    }

    pub fn add_link(&mut self, consumer: &str, resource: &str, efficiency: f64) {
        self.links.push(TrophicLink {
            consumer: consumer.to_string(),
            resource: resource.to_string(),
            efficiency: efficiency.clamp(0.0, 1.0),
        });
    }

    /// Biomasse soutenable pour chaque espèce, calculée du bas vers le haut
    /// par itération de point fixe (les niveaux supérieurs dépendent des
    /// capacités déjà calculées des niveaux inférieurs).
    pub fn carrying_capacities(&self, producer_biomass: &BTreeMap<String, f64>) -> BTreeMap<String, f64> {
        let mut capacities: BTreeMap<String, f64> = BTreeMap::new();
        // Amorçage : producteurs d'abord.
        for (name, role) in &self.roles {
            if matches!(role, TrophicRole::Producer) {
                capacities.insert(name.clone(), producer_biomass.get(name).copied().unwrap_or(0.0));
            }
        }
        // Itération jusqu'à stabilisation (au plus n tours).
        for _ in 0..self.roles.len() {
            let mut changed = false;
            for (name, role) in &self.roles {
                if matches!(role, TrophicRole::Producer) {
                    continue;
                }
                let inflow: f64 = self
                    .links
                    .iter()
                    .filter(|l| &l.consumer == name)
                    .filter_map(|l| capacities.get(&l.resource).map(|b| b * l.efficiency))
                    .sum();
                let capacity = (inflow * ENERGY_TRANSFER_EFFICIENCY).max(0.0);
                if capacities.get(name).copied() != Some(capacity) {
                    changed = true;
                }
                capacities.insert(name.clone(), capacity);
            }
            if !changed {
                break;
            }
        }
        capacities.retain(|name, _| self.roles.contains_key(name));
        capacities
    }

    /// Une population respecte-t-elle les contraintes de coexistence ?
    /// Chaque population non-productrice doit rester sous sa capacité porteuse.
    pub fn coexistence_violations(
        &self,
        populations: &BTreeMap<String, f64>,
        producer_biomass: &BTreeMap<String, f64>,
    ) -> Vec<String> {
        let capacities = self.carrying_capacities(producer_biomass);
        populations
            .iter()
            .filter(|(name, pop)| {
                matches!(self.roles.get(*name), Some(TrophicRole::Consumer | TrophicRole::Predator))
                    && **pop > capacities.get(*name).copied().unwrap_or(0.0) + 1e-9
            })
            .map(|(name, _)| name.clone())
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Succession écologique
// ---------------------------------------------------------------------------

/// Stades de succession après perturbation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum SuccessionStage {
    Pioneer,
    Grassland,
    Shrubland,
    Climax,
}

const STAGE_BIOMASS_THRESHOLDS: [f64; 3] = [50.0, 200.0, 600.0];

/// Un écosystème qui se succède à lui-même au fil des cycles.
#[derive(Clone, Debug)]
pub struct Succession {
    pub stage: SuccessionStage,
    pub biomass: f64,
    /// Croissance logistique par cycle.
    pub growth_rate: f64,
    /// Capacité biotique maximale (borne le climax).
    pub carrying_capacity: f64,
}

impl Succession {
    pub fn new(carrying_capacity: f64) -> Self {
        Self {
            stage: SuccessionStage::Pioneer,
            biomass: 1.0,
            growth_rate: 0.15,
            carrying_capacity: carrying_capacity.max(1.0),
        }
    }

    /// Un cycle de croissance logistique + progression des stades.
    pub fn advance_cycle(&mut self) -> SuccessionStage {
        let k = self.carrying_capacity;
        self.biomass += self.growth_rate * self.biomass * (1.0 - self.biomass / k);
        self.stage = if self.biomass >= STAGE_BIOMASS_THRESHOLDS[2].min(k) {
            SuccessionStage::Climax
        } else if self.biomass >= STAGE_BIOMASS_THRESHOLDS[1] {
            SuccessionStage::Shrubland
        } else if self.biomass >= STAGE_BIOMASS_THRESHOLDS[0] {
            SuccessionStage::Grassland
        } else {
            SuccessionStage::Pioneer
        };
        self.stage
    }

    /// Perturbation : incendie, incident majeur... retombe au stade pionnier.
    pub fn disturb(&mut self, severity: f64) {
        let s = severity.clamp(0.0, 1.0);
        self.biomass *= 1.0 - s;
        if s > 0.5 {
            self.biomass = self.biomass.max(1.0);
            self.stage = SuccessionStage::Pioneer;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn predator_capacity_is_limited_by_prey_energy() {
        let mut net = TrophicNetwork::new();
        net.add_species("grass", TrophicRole::Producer);
        net.add_species("herbivore", TrophicRole::Consumer);
        net.add_species("carnivore", TrophicRole::Predator);
        net.add_link("herbivore", "grass", 0.5);
        net.add_link("carnivore", "herbivore", 0.3);

        let mut producers = BTreeMap::new();
        producers.insert("grass".to_string(), 1000.0);

        let caps = net.carrying_capacities(&producers);
        // Herbivore : 1000*0.5 = 500 d'entrée, x0.1 (Lindeman) => 50.
        // Carnivore : 50*0.3 = 15 d'entrée, x0.1 => 1.5.
        assert!((caps["herbivore"] - 50.0).abs() < 1e-9, "obtenu {}", caps["herbivore"]);
        assert!((caps["carnivore"] - 1.5).abs() < 1e-9, "obtenu {}", caps["carnivore"]);
        assert!(
            caps["carnivore"] < caps["herbivore"],
            "pyramide écologique : le sommet porte moins que l'étage inférieur"
        );
    }

    #[test]
    fn overpopulated_predators_are_flagged() {
        let mut net = TrophicNetwork::new();
        net.add_species("grass", TrophicRole::Producer);
        net.add_species("wolf", TrophicRole::Predator);
        net.add_link("wolf", "grass", 0.2);

        let producers = BTreeMap::from([("grass".to_string(), 100.0)]);
        // Capacité loup : 100*0.2*0.1 = 2. Population de 50 : surpopulation.
        let pops = BTreeMap::from([("wolf".to_string(), 50.0)]);
        let violations = net.coexistence_violations(&pops, &producers);
        assert_eq!(violations, vec!["wolf".to_string()]);

        // Population sous capacité : aucune violation.
        let ok = BTreeMap::from([("wolf".to_string(), 1.5)]);
        assert!(net.coexistence_violations(&ok, &producers).is_empty());
    }

    #[test]
    fn succession_progresses_then_resets_on_disturbance() {
        let mut eco = Succession::new(1000.0);
        assert_eq!(eco.stage, SuccessionStage::Pioneer);

        let mut reached_climax = false;
        for _ in 0..200 {
            let stage = eco.advance_cycle();
            if stage == SuccessionStage::Climax {
                reached_climax = true;
                break;
            }
        }
        assert!(reached_climax, "la succession doit atteindre le climax");

        // Incendie sévère : retour au stade pionnier.
        eco.disturb(0.99);
        assert_eq!(eco.stage, SuccessionStage::Pioneer);
        assert!(eco.biomass < 20.0, "la biomasse s'effondre ({})", eco.biomass);

        // La succession repart.
        for _ in 0..300 {
            eco.advance_cycle();
        }
        assert_eq!(eco.stage, SuccessionStage::Climax);
    }

    #[test]
    fn logistic_growth_is_bounded_by_carrying_capacity() {
        let mut eco = Succession::new(100.0);
        for _ in 0..500 {
            eco.advance_cycle();
        }
        assert!(
            eco.biomass <= 100.0 + 1e-6,
            "jamais au-dessus de la capacité biotique ({})",
            eco.biomass
        );
    }
}
