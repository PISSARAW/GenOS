use serde::{Deserialize, Serialize};
use super::*;


#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Neurotransmitter {
    #[serde(alias = "Glutamate", alias = "glutamate")]
    Glutamate, // Excitateur (Déclenche le potentiel d'action)
    #[serde(alias = "GABA", alias = "gaba", alias = "Gaba")]
    GABA,      // Inhibiteur (Bloque le signal électrique)
    #[serde(alias = "Dopamine", alias = "dopamine")]
    Dopamine,  // Renforcement (Motivation et apprentissage positif)
    #[serde(alias = "Serotonin", alias = "serotonin")]
    Serotonin, // Modulation (Stabilisation du réseau)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NeuroSignal {
    pub transmitter: Neurotransmitter,
    pub amount: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum NervousSystemLocation {
    Central,
    Peripheral,
}
