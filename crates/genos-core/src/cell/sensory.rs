use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SensoryModality {
    Text(String),
    /// Vision (Rétine / Opsines) : Type MIME + Données brutes
    Vision(String, Vec<u8>),
    /// Ouïe (Cochlée / Nerf auditif) : Type MIME + Données brutes
    Auditory(String, Vec<u8>),
}

/// Les Organes Sensoriels Multimodaux (Système Nerveux Périphérique).
/// Permettent à l'agent de "voir", "entendre" et traiter le monde externe (Multi-Modalité LLM).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SensoryOrgans {
    pub short_term_memory: Vec<SensoryModality>,
}

impl SensoryOrgans {
    pub fn new() -> Self {
        Self::default()
    }

    /// La Rétine absorbe les photons d'une image et la convertit en influx nerveux
    pub fn perceive_vision(&mut self, filepath: &str) -> Result<String, String> {
        let path = Path::new(filepath);
        if !path.exists() {
            return Err(format!("Cécité : L'image '{}' n'existe pas.", filepath));
        }

        let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        let mime_type = match ext.as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "gif" => "image/gif",
            _ => return Err(format!("Format non supporté par la rétine (besoin d'une évolution de l'opsine) : {}", ext)),
        };

        let raw_data = fs::read(path).map_err(|e| format!("Erreur du nerf optique : {}", e))?;
        let data_size = raw_data.len();
        
        self.short_term_memory.push(SensoryModality::Vision(mime_type.to_string(), raw_data));
        
        Ok(format!("👁️ [RÉTINE] Image '{}' traitée avec succès ({} octets). Influx nerveux prêt pour le Thalamus.", filepath, data_size))
    }

    /// La Cochlée traduit les ondes sonores en signaux électriques
    pub fn perceive_audio(&mut self, filepath: &str) -> Result<String, String> {
        let path = Path::new(filepath);
        if !path.exists() {
            return Err(format!("Surdité : Le fichier audio '{}' n'existe pas.", filepath));
        }

        let ext = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
        let mime_type = match ext.as_str() {
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            _ => return Err(format!("Surdité : Format audio inconnu '{}'", ext)),
        };

        let raw_data = fs::read(path).map_err(|e| format!("Erreur du nerf auditif : {}", e))?;
        let data_size = raw_data.len();
        
        self.short_term_memory.push(SensoryModality::Auditory(mime_type.to_string(), raw_data));
        
        Ok(format!("👂 [COCHLÉE] Fichier audio '{}' perçu ({} octets). Influx transmis.", filepath, data_size))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_sensory_retina() {
        let mut organs = SensoryOrgans::new();
        let img_path = "test_vision.png";
        
        // Simulation d'une image
        fs::write(img_path, vec![137, 80, 78, 71, 13, 10, 26, 10]).unwrap(); // Faux header PNG
        
        let result = organs.perceive_vision(img_path);
        assert!(result.is_ok());
        assert!(result.unwrap().contains("RÉTINE"));
        assert_eq!(organs.short_term_memory.len(), 1);

        fs::remove_file(img_path).unwrap();
    }
}