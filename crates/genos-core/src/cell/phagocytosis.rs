use crate::cell::AgentCell;
use crate::cell::organelles::FunctionalProtein;
use std::fs;
use std::path::Path;

impl AgentCell {
    /// Phagocytose : La cellule ingère un fichier externe (code ou prompt)
    pub fn phagocytize_file(&mut self, filepath: &str) -> Result<String, String> {
        let path = Path::new(filepath);
        if !path.exists() {
            return Err(format!("Antigène introuvable: {}", filepath));
        }

        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let line_count = content.lines().count();

        // Analyse immunologique primaire
        let mut is_toxic = false;
        let mut ubiquitin_tags = 0;

        // RÈGLE ABSOLUE DE GEMINI.md : Pas de fichier > 400 lignes
        if line_count >= 400 {
            ubiquitin_tags += 4; // Baiser de la mort immédiat
            is_toxic = true;
        }

        // Stress oxydatif mineur
        if content.contains("TODO") || content.contains("unwrap()") {
            ubiquitin_tags += 1; 
        }

        let tool_n = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        let protein = FunctionalProtein {
            tool_name: format!("FileDigest:{}", tool_n),
            is_misfolded: is_toxic,
            ubiquitin_chain: ubiquitin_tags,
        };

        self.cytoplasm.active_proteins.push(protein);

        let mut report = format!("🧬 [Phagocytose] '{}' ingéré ({} lignes).\n", filepath, line_count);
        
        if ubiquitin_tags > 0 {
            report.push_str(&format!("🦠 DÉTECTION DE TOXINES : {} marqueur(s) Ubiquitine accroché(s).\n", ubiquitin_tags));
        } else {
            report.push_str("✅ Code sain. Aucune ubiquitine attachée.\n");
        }

        if ubiquitin_tags >= 4 {
            report.push_str("⚠️ DANGER : Règle des 400 lignes violée. Ce fichier est cancérigène. Le Protéasome va le détruire.");
        }

        Ok(report)
    }
}
