use crate::genome::Locus;
use serde::{Deserialize, Serialize};

/// Représente l'état épigénétique d'un agent.
/// `methylation_level` : Régule à long terme l'inhibition des gènes.
/// `histone_acetylation` : Facilite l'expression rapide de certains traits.
#[derive(Clone, Debug, PartialEq, Default, Serialize, Deserialize)]
pub struct ChromatinVector {
    pub methylation_level: f32,
    pub histone_acetylation: f32,
}

/// Modélise un opéron, unité fonctionnelle regroupant plusieurs gènes (Locus)
/// sous le contrôle d'un même promoteur, modulé par le vecteur de chromatine.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Operon {
    pub promoter: String,
    pub genes: Vec<Locus>,
    pub chromatin: ChromatinVector,
}
