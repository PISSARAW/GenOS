
fn str_levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let len_a = a_chars.len();
    let len_b = b_chars.len();
    if len_a == 0 { return len_b; }
    if len_b == 0 { return len_a; }
    let mut matrix = vec![vec![0; len_b + 1]; len_a + 1];
    for i in 0..=len_a { matrix[i][0] = i; }
    for j in 0..=len_b { matrix[0][j] = j; }
    for i in 1..=len_a {
        for j in 1..=len_b {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            matrix[i][j] = (matrix[i - 1][j] + 1).min(matrix[i][j - 1] + 1).min(matrix[i - 1][j - 1] + cost);
        }
    }
    matrix[len_a][len_b]
}
use serde::{Deserialize, Serialize};
use crate::genome::Gene;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RedundancySystem {
    /// NIVEAU 1 : Redondance du Code (Mutations Silencieuses)
    /// Tolérance aux erreurs de parsing. En IA : Capacité à comprendre "SEARHC" au lieu de "SEARCH".
    pub codon_degeneracy_tolerance: f64,

    /// NIVEAU 2 : Redondance des Gènes (Copie de sauvegarde)
    /// En IA : Fallback sur un modèle/outil différent si le premier échoue (ex: DuckDuckGo -> Google).
    pub backup_plasmids: Vec<Gene>,

    /// NIVEAU 3 : Redondance Systémique (Ceinture et Bretelles)
    /// En IA : L''orchestrateur bascule sur un Agent de secours si le Worker principal crashe.
    pub active_alternative_pathways: usize,
}

impl RedundancySystem {
    pub fn new() -> Self {
        Self {
            codon_degeneracy_tolerance: 0.85, // 85% de match requis (Tolère 15% de mutation/bruit)
            backup_plasmids: Vec::new(),
            active_alternative_pathways: 2, // 2 "Reins" / "Poumons"
        }
    }

    /// Simule la tolérance aux fautes de frappe génétiques (Mutations Silencieuses)
    pub fn execute_instruction_with_redundancy(&self, expected_tool: &str, mutated_tool: &str) -> Result<(), String> {
        let distance = str_levenshtein(expected_tool, mutated_tool) as f64;
        let match_ratio = 1.0 - (distance / expected_tool.len() as f64);
        
        if match_ratio >= self.codon_degeneracy_tolerance {
            Ok(()) // La mutation est SILENCIEUSE ! L''instruction est exécutée quand même.
        } else {
            Err(format!("Mutation trop sévère : {} ne correspond plus à {}", mutated_tool, expected_tool))
        }
    }

    /// Simule la bascule sur la voie métabolique / outil de secours
    pub fn fallback_execution(&mut self) -> Result<Gene, String> {
        if let Some(backup) = self.backup_plasmids.pop() {
            Ok(backup) // Utilise la copie de sauvegarde (Duplication de gène)
        } else if self.active_alternative_pathways > 0 {
            self.active_alternative_pathways -= 1;
            Ok(Gene::new("ALTERNATIVE_PATHWAY", "METABOLIC_BYPASS_ACTIVATED"))
        } else {
            Err("Extinction systémique : Toutes les redondances sont épuisées.".to_string())
        }
    }
}
