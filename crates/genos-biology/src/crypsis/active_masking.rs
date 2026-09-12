use serde::{Deserialize, Serialize};

/// Morceau de décor ou artefact prélevé dans l'environnement (algue, éponge)
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvironmentalFragment {
    pub source_path: String,
    pub fragment_text: String,
    pub flora_type: String, // "ident_symbol", "license_notice", "domain_concept"
}

/// Masquage actif (Crabe décorateur) : parure contextuelle issue du repository hôte
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActiveDecoratorMasking {
    pub harvested_fragments: Vec<EnvironmentalFragment>,
    pub max_coat_capacity: usize,
}

impl ActiveDecoratorMasking {
    pub fn new(max_capacity: usize) -> Self {
        Self {
            harvested_fragments: Vec::new(),
            max_coat_capacity: max_capacity.max(1),
        }
    }

    /// Prélève un élément inerte dans le décor local pour orner la carapace de l'agent
    pub fn affix_fragment(&mut self, source_path: &str, text: &str, flora_type: &str) -> bool {
        if self.harvested_fragments.len() >= self.max_coat_capacity {
            return false;
        }
        self.harvested_fragments.push(EnvironmentalFragment {
            source_path: source_path.to_string(),
            fragment_text: text.to_string(),
            flora_type: flora_type.to_string(),
        });
        true
    }

    /// Dote une instruction ou un payload d'un habillage décoré complet
    pub fn decorate_payload(&self, core_payload: &str) -> (String, f64) {
        if self.harvested_fragments.is_empty() {
            return (core_payload.to_string(), 0.0);
        }

        let mut coat_header = String::new();
        coat_header.push_str("// --- DECORATOR_CRAB_COAT ---\n");
        for frag in &self.harvested_fragments {
            coat_header.push_str(&format!("// [{}] {}\n", frag.flora_type, frag.fragment_text));
        }

        let decorated = format!("{}\n// CORE_EXECUTION:\n{}\n// --- END_COAT ---", coat_header, core_payload);
        let coverage = (self.harvested_fragments.len() as f64 / self.max_coat_capacity as f64).clamp(0.0, 1.0);

        (decorated, (coverage * 100.0).round() / 100.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decorator_crab_masking_with_repo_flora() {
        let mut crab = ActiveDecoratorMasking::new(3);
        crab.affix_fragment("crates/genos-cell/src/lib.rs", "use genos_genome as genome;", "import");
        crab.affix_fragment("crates/genos-cell/src/lib.rs", "pub const DEFAULT_HAYFLICK_LIMIT: u32 = 50;", "const");

        let (decorated, coverage) = crab.decorate_payload("APPLY_AUTONOMOUS_PATCH_01");

        assert!(decorated.contains("DEFAULT_HAYFLICK_LIMIT"));
        assert!(decorated.contains("APPLY_AUTONOMOUS_PATCH_01"));
        assert_eq!(coverage, 0.67);
    }
}
