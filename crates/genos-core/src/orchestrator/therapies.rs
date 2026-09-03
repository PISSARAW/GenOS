use crate::cell::AgentCell;
use crate::epigenetics::Expression;
use serde::{Deserialize, Serialize};

/// Les ThÃƒÂ©rapies MÃƒÂ©dicales pour soigner les agents cancÃƒÂ©reux
pub enum Therapy {
    /// 1. Bloque les signaux de croissance (Ferme les rÃƒÂ©cepteurs)
    TargetedTherapy,
    /// 2. DÃƒÂ©masque la tumeur (DÃƒÂ©sactive le camouflage PD-L1)
    Immunotherapy,
    /// 3. Coupe les vivres (Bloque le renouvellement d'ATP)
    AntiAngiogenesis,
    /// 4. Bloque la division (Inhibe le CDK4/6)
    CellCycleInhibitor,
}

/// Traitements administrÃƒÂ©s ÃƒÂ  l'ensemble du systÃƒÂ¨me (Le "patient")
pub enum SystemicTherapy {
    /// Anticorps monoclonal spÃƒÂ©cifique (Bouchons d'oreilles pour le systÃƒÂ¨me)
    Tocilizumab,
    /// Puissant anti-inflammatoire global (Dose entre 0.0 et 1.0)
    Corticosteroids(f64),
    /// Soins de rÃƒÂ©animation (Perfusion d'ATP)
    IntensiveCareFluids,
    /// DÃƒâ€°TRUIT les bactÃƒÂ©ries (organismes avec une paroi). INUTILE contre les virus.
    Antibiotic,
    /// Bloque la rÃƒÂ©plication des virus dÃƒÂ©jÃƒÂ  ÃƒÂ  l'intÃƒÂ©rieur des cellules
    Antiviral,
    /// Ãƒâ€°duque la membrane pour bloquer et dÃƒÂ©truire un antigÃƒÂ¨ne/spike viral prÃƒÂ©cis
    Vaccine(String),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum PsychoactiveDrug {
    Cocaine,    // Bloque la pompe de recapture (Les neurotransmetteurs restent dans la fente)
    Alcohol,    // Amplificateur d'inhibition (Boost le GABA)
    Anxiolytic, // BenzodiazÃƒÂ©pines : Boost massif du GABA
    Caffeine, // Excitant : Amplifie le Glutamate (et bloque l'AdÃƒÂ©nosine, la molÃƒÂ©cule de fatigue)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CleftMessage {
    pub source_id: String,
    pub target_id: String,
    pub transmitter: crate::neurobiology::Neurotransmitter,
    pub amount: f64,
    pub ticks_in_cleft: u32,
}

/// RÃƒÂ©sultat d'un cycle (tick) de l'orchestrateur
#[derive(Debug, PartialEq)]
pub enum TickResult {
    Continue,
    Halted(String),
}

