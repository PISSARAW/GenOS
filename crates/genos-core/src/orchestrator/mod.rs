pub mod therapies;
pub mod methods;
pub mod cart;

pub use therapies::*;
pub use cart::*;

use crate::cell::AgentCell;
use crate::epigenetics::Expression;
use serde::{Deserialize, Serialize};

/// L'orchestrateur gère la boucle de vie de la cellule IA (l'Agent).
pub struct Orchestrator {
    pub apoptosis_rule: Option<Expression>,
    /// Protéine messagère de l'inflammation systémique
    pub il6_level: f64,
    /// Antidote (Tocilizumab) agissant comme des bouchons d'oreilles
    pub il6_receptors_blocked: bool,
    /// Niveau de suppression globale par les corticoïdes
    pub corticosteroid_level: f64,
    /// Immunité Humorale : Les anticorps qui patrouillent dans le système
    pub circulating_antibodies: Vec<crate::cell::Antibody>,
    /// Système Endocrine (Autoroute sanguine) : Hormones circulant dans tout le corps
    pub circulating_hormones: Vec<crate::signaling::Ligand>,
    /// Le taux de sucre dans le sang
    pub blood_glucose: f64,
    /// Niveau d'activation de l'armée (dicté par les Lymphocytes T CD4)
    pub immune_activation_level: f64,

    // --- SYSTÃƒË†ME NERVEUX ---
    /// La Fente Synaptique : l'espace vide où flottent les neurotransmetteurs
    pub synaptic_cleft: Vec<CleftMessage>,
    /// Pharmacologie : Drogues et médicaments psychoactifs
    pub psychoactive_drugs: Vec<PsychoactiveDrug>,
    pub blood_brain_barrier_integrity: f64,
    pub amyloid_plaques: f64,
    pub cerebrospinal_fluid_volume: f64,
    pub cerebrospinal_fluid_pressure: f64,
    pub csf_drainage_blocked: bool,
    pub viral_environment: Vec<crate::virology::Virion>,
}

