use std::collections::HashMap;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Un instantané (Snapshot) de fichier capturé avant modification (Rollback)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileSnapshot {
    pub filepath: String,
    pub original_content: String,
    pub timestamp: DateTime<Utc>,
}

/// Les Vacuoles de Sauvegarde (L'équivalent du VFS / Time-Travel Rollback de la V1).
/// Elles permettent à la cellule de réparer l'ADN (ou les fichiers du disque)
/// en cas d'erreur de génération, de rejet immunitaire ou d'attaque virale.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Vacuole {
    pub stored_snapshots: HashMap<String, FileSnapshot>,
}

impl Vacuole {
    pub fn new() -> Self {
        Self::default()
    }

    /// Endosporulation locale : Capture l'état exact d'un fichier avant qu'il ne soit muté
    pub fn store_backup(&mut self, filepath: &str) -> Result<(), String> {
        let path = Path::new(filepath);
        if !path.exists() {
            return Err(format!("Le fichier n'existe pas : {}", filepath));
        }

        if let Ok(content) = fs::read_to_string(path) {
            let snapshot = FileSnapshot {
                filepath: filepath.to_string(),
                original_content: content,
                timestamp: Utc::now(),
            };
            self.stored_snapshots.insert(filepath.to_string(), snapshot);
            Ok(())
        } else {
            Err(format!("Impossible de créer la vacuole de sauvegarde pour : {}", filepath))
        }
    }

    /// Réparation de l'ADN (Rollback) : Restaure le fichier depuis la vacuole
    pub fn rollback_file(&mut self, filepath: &str) -> Result<String, String> {
        if let Some(snapshot) = self.stored_snapshots.remove(filepath) {
            fs::write(filepath, snapshot.original_content)
                .map_err(|e| format!("Erreur d'Exocytose réparatrice : {}", e))?;
            Ok(format!("🧬 [Réparation] Fichier '{}' restauré à son état initial (Rollback réussi).", filepath))
        } else {
            Err(format!("Rejet : Aucune vacuole de sauvegarde trouvée pour : {}", filepath))
        }
    }

    /// Libère la mémoire (Lysosome digest) une fois la mutation validée
    pub fn digest_vacuole(&mut self, filepath: &str) {
        self.stored_snapshots.remove(filepath);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_vacuole_rollback() {
        let mut vacuole = Vacuole::new();
        let test_file = "test_rollback.txt";
        
        // Création du fichier d'origine
        fs::write(test_file, "Code SANS bugs").unwrap();

        // 1. Snapshot avant mutation
        assert!(vacuole.store_backup(test_file).is_ok());

        // 2. Mutation toxique (Erreur du LLM)
        fs::write(test_file, "Code AVEC bugs").unwrap();

        // 3. Rollback
        let result = vacuole.rollback_file(test_file);
        assert!(result.is_ok());
        assert!(result.unwrap().contains("restauré"));

        // Vérification
        let content = fs::read_to_string(test_file).unwrap();
        assert_eq!(content, "Code SANS bugs");

        fs::remove_file(test_file).unwrap();
    }
}