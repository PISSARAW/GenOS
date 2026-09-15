//! Moteur de réactions chimiques réelles : molécules définies par leur formule
//! atomique, réactions stœchiométriques dont le bilan de matière (nombre
//! d'atomes de chaque élément) est vérifié programmatiquement, et bilan
//! d'énergie dérivé des enthalpies de formation — pas des blobs ni des
//! tenseurs, mais des espèces moléculaires et des moles réelles.

use std::collections::HashMap;

/// Éléments chimiques suivis (suffisants pour les voies glycolytiques).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Element {
    C,
    H,
    O,
    N,
    P,
}

impl Element {
    /// Masse atomique standard (g/mol).
    pub fn atomic_mass(self) -> f64 {
        match self {
            Element::C => 12.011,
            Element::H => 1.008,
            Element::O => 15.999,
            Element::N => 14.007,
            Element::P => 30.974,
        }
    }

    /// Les éléments couverts par ce moteur (utilisé pour vérifier tout bilan).
    pub fn all() -> [Element; 5] {
        [Element::C, Element::H, Element::O, Element::N, Element::P]
    }
}

/// Une espèce moléculaire réelle : formule atomique + enthalpie de formation.
#[derive(Clone, Debug)]
pub struct Molecule {
    pub name: String,
    pub formula: Vec<(Element, u32)>,
    /// Enthalpie standard de formation (kJ/mol), valeur approximative de la
    /// littérature biochimique, utilisée pour le bilan énergétique réel.
    pub enthalpy_kj_per_mol: f64,
}

impl Molecule {
    pub fn new(name: &str, formula: &[(Element, u32)], enthalpy_kj_per_mol: f64) -> Self {
        Self {
            name: name.to_string(),
            formula: formula.to_vec(),
            enthalpy_kj_per_mol,
        }
    }

    /// Masse molaire (g/mol) calculée depuis la composition atomique réelle.
    pub fn molar_mass(&self) -> f64 {
        self.formula.iter().map(|(el, n)| el.atomic_mass() * (*n as f64)).sum()
    }

    fn atom_count(&self, element: Element) -> u32 {
        self.formula
            .iter()
            .filter(|(el, _)| *el == element)
            .map(|(_, n)| *n)
            .sum()
    }
}

pub type MoleculeId = &'static str;
/// Un terme d'équation chimique : espèce + coefficient stœchiométrique.
pub type Term = (MoleculeId, u32);

/// Une réaction chimique équilibrée, validée à l'enregistrement.
#[derive(Clone, Debug)]
pub struct Reaction {
    pub name: String,
    pub reactants: Vec<Term>,
    pub products: Vec<Term>,
}

impl Reaction {
    pub fn new(name: &str, reactants: &[Term], products: &[Term]) -> Self {
        Self {
            name: name.to_string(),
            reactants: reactants.to_vec(),
            products: products.to_vec(),
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum ChemError {
    UnknownSpecies(String),
    UnknownReaction(String),
    MassImbalance { element: String, left: u32, right: u32 },
    InsufficientSubstrate(String),
}

/// Résultat réel d'une réaction exécutée : matière et énergie mesurées.
#[derive(Clone, Debug)]
pub struct ReactionYield {
    pub reaction: String,
    pub extent_mol: f64,
    pub mass_in_g: f64,
    pub mass_out_g: f64,
    pub energy_released_kj: f64,
}

/// Un réseau métabolique structuré : bassins de molécules (moles présentes)
/// et réactions liées entre elles (produits de l'une = réactifs de l'autre).
#[derive(Clone, Debug, Default)]
pub struct MetabolicNetwork {
    species: HashMap<MoleculeId, Molecule>,
    pools_mol: HashMap<MoleculeId, f64>,
    reactions: Vec<Reaction>,
}

impl MetabolicNetwork {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_species(&mut self, id: MoleculeId, molecule: Molecule) {
        self.pools_mol.entry(id).or_insert(0.0);
        self.species.insert(id, molecule);
    }

    /// Ajoute une réaction après avoir vérifié le bilan de matière réel
    /// (chaque élément doit apparaître en nombre égal des deux côtés).
    pub fn add_reaction(&mut self, reaction: Reaction) -> Result<(), ChemError> {
        self.check_atom_balance(&reaction)?;
        self.reactions.push(reaction);
        Ok(())
    }

    pub fn deposit(&mut self, id: MoleculeId, moles: f64) {
        *self.pools_mol.entry(id).or_insert(0.0) += moles.max(0.0);
    }

    pub fn quantity_mol(&self, id: MoleculeId) -> f64 {
        *self.pools_mol.get(id).unwrap_or(&0.0)
    }

    pub fn molar_mass_of(&self, id: MoleculeId) -> Option<f64> {
        self.species.get(id).map(Molecule::molar_mass)
    }

    fn check_atom_balance(&self, reaction: &Reaction) -> Result<(), ChemError> {
        for element in Element::all() {
            let left = self.side_atom_count(&reaction.reactants, element)?;
            let right = self.side_atom_count(&reaction.products, element)?;
            if left != right {
                return Err(ChemError::MassImbalance {
                    element: format!("{:?}", element),
                    left,
                    right,
                });
            }
        }
        Ok(())
    }

    fn side_atom_count(&self, side: &[Term], element: Element) -> Result<u32, ChemError> {
        let mut total = 0u32;
        for (id, coeff) in side {
            let molecule = self
                .species
                .get(id)
                .ok_or_else(|| ChemError::UnknownSpecies(id.to_string()))?;
            total += molecule.atom_count(element) * coeff;
        }
        Ok(total)
    }

    fn side_mass_g(&self, side: &[Term], extent: f64) -> f64 {
        side.iter()
            .filter_map(|(id, coeff)| {
                self.species.get(*id).map(|m| m.molar_mass() * (*coeff as f64) * extent)
            })
            .sum()
    }

    fn side_enthalpy_kj(&self, side: &[Term], extent: f64) -> f64 {
        side.iter()
            .filter_map(|(id, coeff)| {
                self.species.get(*id).map(|m| m.enthalpy_kj_per_mol * (*coeff as f64) * extent)
            })
            .sum()
    }

    fn find_reaction(&self, name: &str) -> Result<Reaction, ChemError> {
        self.reactions
            .iter()
            .find(|r| r.name == name)
            .cloned()
            .ok_or_else(|| ChemError::UnknownReaction(name.to_string()))
    }

    fn limiting_extent(&self, reaction: &Reaction, requested: f64) -> Result<f64, ChemError> {
        let mut extent = requested.max(0.0);
        for (id, coeff) in &reaction.reactants {
            let available = self.quantity_mol(id);
            extent = extent.min(available / (*coeff as f64));
        }
        if extent <= 1e-12 {
            return Err(ChemError::InsufficientSubstrate(reaction.name.clone()));
        }
        Ok(extent)
    }

    fn apply_extent(&mut self, reaction: &Reaction, extent: f64) {
        for (id, coeff) in &reaction.reactants {
            *self.pools_mol.entry(id).or_insert(0.0) -= (*coeff as f64) * extent;
        }
        for (id, coeff) in &reaction.products {
            *self.pools_mol.entry(id).or_insert(0.0) += (*coeff as f64) * extent;
        }
    }

    /// Exécute une réaction jusqu'à l'extent limité par le réactif limitant réel,
    /// débite/crédite les bassins de matière et renvoie le bilan mesuré.
    pub fn run_reaction(&mut self, name: &str, requested_extent_mol: f64) -> Result<ReactionYield, ChemError> {
        let reaction = self.find_reaction(name)?;
        let extent = self.limiting_extent(&reaction, requested_extent_mol)?;
        let mass_in = self.side_mass_g(&reaction.reactants, extent);
        let mass_out = self.side_mass_g(&reaction.products, extent);
        let energy_released =
            self.side_enthalpy_kj(&reaction.reactants, extent) - self.side_enthalpy_kj(&reaction.products, extent);
        self.apply_extent(&reaction, extent);
        Ok(ReactionYield {
            reaction: reaction.name.clone(),
            extent_mol: extent,
            mass_in_g: mass_in,
            mass_out_g: mass_out,
            energy_released_kj: energy_released,
        })
    }
}

/// Vérifie le bilan de masse global d'une séquence de réactions exécutées :
/// la masse totale entrante doit égaler la masse totale sortante (loi de
/// Lavoisier), aux erreurs d'arrondi flottant près.
pub fn verify_mass_conservation(yields: &[ReactionYield]) -> bool {
    let mass_in: f64 = yields.iter().map(|y| y.mass_in_g).sum();
    let mass_out: f64 = yields.iter().map(|y| y.mass_out_g).sum();
    (mass_in - mass_out).abs() <= 1e-6 * mass_in.max(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn glucose() -> Molecule {
        Molecule::new("Glucose", &[(Element::C, 6), (Element::H, 12), (Element::O, 6)], -1273.3)
    }

    fn water() -> Molecule {
        Molecule::new("Water", &[(Element::H, 2), (Element::O, 1)], -285.8)
    }

    #[test]
    fn balanced_reaction_is_accepted_and_conserves_mass() {
        let mut net = MetabolicNetwork::new();
        net.register_species("glucose", glucose());
        net.register_species("water", water());
        // Réaction fictive équilibrée : Glucose -> Glucose (identité), sert à
        // vérifier que le contrôle de bilan accepte une réaction cohérente.
        let reaction = Reaction::new("identity", &[("glucose", 1)], &[("glucose", 1)]);
        assert!(net.add_reaction(reaction).is_ok());
        net.deposit("glucose", 2.0);
        let y = net.run_reaction("identity", 1.0).unwrap();
        assert!(verify_mass_conservation(&[y]));
    }

    #[test]
    fn unbalanced_reaction_is_rejected() {
        let mut net = MetabolicNetwork::new();
        net.register_species("glucose", glucose());
        net.register_species("water", water());
        // Glucose -> Eau n'est pas équilibré en atomes (6 C perdus) : doit être rejeté.
        let reaction = Reaction::new("bad", &[("glucose", 1)], &[("water", 1)]);
        let err = net.add_reaction(reaction).unwrap_err();
        assert!(matches!(err, ChemError::MassImbalance { .. }));
    }

    #[test]
    fn insufficient_substrate_blocks_reaction() {
        let mut net = MetabolicNetwork::new();
        net.register_species("glucose", glucose());
        let reaction = Reaction::new("identity", &[("glucose", 1)], &[("glucose", 1)]);
        net.add_reaction(reaction).unwrap();
        let err = net.run_reaction("identity", 1.0).unwrap_err();
        assert!(matches!(err, ChemError::InsufficientSubstrate(_)));
    }
}
