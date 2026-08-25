use crate::genome::Locus;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Seuil de méthylation au-delà duquel un opéron entre en hétérochromatine
/// (compétence masquée du contexte mais rappelable à coût O(1)).
pub const HETEROCHROMATIN_METHYLATION_THRESHOLD: f32 = 0.3;

/// Représente l'état épigénétique d'un agent.
/// `methylation_level` : Régule à long terme l'inhibition des gènes.
/// `histone_acetylation` : Facilite l'expression rapide de certains traits.
#[derive(Clone, Debug, PartialEq, Default, Serialize, Deserialize)]
pub struct ChromatinVector {
    pub methylation_level: f32,
    pub histone_acetylation: f32,
}

impl ChromatinVector {
    /// Euchromatine : région active, instructions transcrites dans le contexte.
    pub fn is_euchromatin(&self) -> bool {
        self.methylation_level <= HETEROCHROMATIN_METHYLATION_THRESHOLD
    }

    /// Facteur multiplicatif appliqué à l'expression des gènes de l'opéron.
    /// Hétérochromatine condensée => facteur nul (gène masqué).
    /// Acétylation des histones => boost borné [0, 1] ajouté au facteur de base.
    pub fn expression_factor(&self) -> f32 {
        if self.is_euchromatin() {
            1.0 + self.histone_acetylation.clamp(0.0, 1.0)
        } else {
            0.0
        }
    }

    /// Condense la chromatine (méthylation accrue) : masque progressivement la compétence.
    pub fn condense(&mut self, delta: f32) {
        self.methylation_level = (self.methylation_level + delta).clamp(0.0, 1.0);
    }

    /// Détend la chromatine (dé-méthylation) : rappelle une compétence masquée.
    pub fn relax(&mut self, delta: f32) {
        self.methylation_level = (self.methylation_level - delta).clamp(0.0, 1.0);
    }

    /// Acétyle les histones pour faciliter l'expression rapide (borné [0, 1]).
    pub fn acetylate(&mut self, delta: f32) {
        self.histone_acetylation = (self.histone_acetylation + delta).clamp(0.0, 1.0);
    }

    /// Désacétyle les histones.
    pub fn deacetylate(&mut self, delta: f32) {
        self.histone_acetylation = (self.histone_acetylation - delta).clamp(0.0, 1.0);
    }
}

/// Modélise un opéron, unité fonctionnelle regroupant plusieurs gènes (Locus)
/// sous le contrôle d'un même promoteur, modulé par le vecteur de chromatine.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Operon {
    pub promoter: String,
    pub genes: Vec<Locus>,
    pub chromatin: ChromatinVector,
}

impl Operon {
    /// Un opéron est actif si sa chromatine est en état euchromatinien.
    pub fn is_active(&self) -> bool {
        self.chromatin.is_euchromatin()
    }

    /// Valeur exprimée d'un gène de cet opéron, pondérée par le facteur chromatique.
    /// Retourne `None` si le gène est absent ou si l'opéron est masqué (hétérochromatine).
    pub fn expressed_value_of(&self, gene_name: &str) -> Option<f32> {
        if !self.is_active() {
            return None;
        }
        let factor = self.chromatin.expression_factor();
        self.genes
            .iter()
            .find(|l| l.gene_name == gene_name)
            .map(|l| l.expressed_value() * factor)
    }

    /// Carte des drives co-exprimés par cet opéron (co-expression coordonnée).
    pub fn expressed_drives(&self) -> BTreeMap<String, f32> {
        let mut map = BTreeMap::new();
        if !self.is_active() {
            return map;
        }
        let factor = self.chromatin.expression_factor();
        for locus in &self.genes {
            map.insert(locus.gene_name.clone(), locus.expressed_value() * factor);
        }
        map
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn operon(methylation: f32, acetylation: f32) -> Operon {
        Operon {
            promoter: "rust_compile_lint".to_string(),
            genes: vec![Locus {
                gene_name: "verification_threshold".to_string(),
                value: 0.5,
                epigenetic_marker: 0.1,
            }],
            chromatin: ChromatinVector {
                methylation_level: methylation,
                histone_acetylation: acetylation,
            },
        }
    }

    #[test]
    fn euchromatin_expresses_genes() {
        let o = operon(0.0, 0.0);
        assert!(o.is_active());
        assert_eq!(o.expressed_value_of("verification_threshold"), Some(0.6));
    }

    #[test]
    fn heterochromatin_masks_genes_but_stays_recallable() {
        let mut o = operon(0.0, 0.0);
        assert!(o.is_active());
        // Condensation : la compétence est masquée, pas supprimée.
        o.chromatin.condense(0.4);
        assert!(!o.is_active());
        assert_eq!(o.expressed_value_of("verification_threshold"), None);
        assert_eq!(o.expressed_drives().len(), 0);
        // Dé-méthylation : rappel O(1) de la compétence masquée.
        o.chromatin.relax(0.4);
        assert!(o.is_active());
        assert!(o.expressed_value_of("verification_threshold").is_some());
    }

    #[test]
    fn threshold_is_inclusive_for_euchromatin() {
        let o = operon(HETEROCHROMATIN_METHYLATION_THRESHOLD, 0.0);
        assert!(o.chromatin.is_euchromatin());
        assert!(o.expressed_value_of("verification_threshold").is_some());
    }

    #[test]
    fn histone_acetylation_boosts_expression_within_bounds() {
        let o = operon(0.0, 0.5);
        assert_eq!(o.chromatin.expression_factor(), 1.5);
        assert!((o.expressed_value_of("verification_threshold").unwrap() - 0.9).abs() < 1e-6);
        // Bornes : clamp à [0, 1].
        let mut boosted = operon(0.0, 0.9);
        boosted.chromatin.acetylate(0.5);
        assert_eq!(boosted.chromatin.histone_acetylation, 1.0);
        boosted.chromatin.deacetylate(2.0);
        assert_eq!(boosted.chromatin.histone_acetylation, 0.0);
    }

    #[test]
    fn co_expression_returns_all_drives_when_active_only() {
        let mut o = operon(0.0, 0.0);
        o.genes.push(Locus {
            gene_name: "exploration".to_string(),
            value: 0.7,
            epigenetic_marker: 0.0,
        });
        let drives = o.expressed_drives();
        assert_eq!(drives.get("exploration"), Some(&0.7));
        assert_eq!(drives.get("verification_threshold"), Some(&0.6));
        o.chromatin.condense(1.0);
        assert!(o.expressed_drives().is_empty());
    }

    #[test]
    fn condensation_and_relaxation_are_clamped() {
        let mut c = ChromatinVector::default();
        c.condense(2.0);
        assert_eq!(c.methylation_level, 1.0);
        c.relax(3.0);
        assert_eq!(c.methylation_level, 0.0);
    }
}
