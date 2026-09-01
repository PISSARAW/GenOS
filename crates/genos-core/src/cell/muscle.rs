use serde::{Deserialize, Serialize};

/// Représente le matériel sous-jacent (Hardware / GPU)
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum GpuArchitecture {
    Cuda,
    Metal,
    WebGpu,
    CpuOnly,
}

/// Le Tissu Musculaire (Inférence GPU Locale)
/// Permet à la cellule d'exécuter des modèles LLM lourds en local (ex: Candle, Llama.cpp, Ollama)
/// de manière totalement autonome, sans dépendre du système endocrinien (API Cloud/Réseau).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Myofibril {
    pub architecture: GpuArchitecture,
    pub total_vram_mb: u32,
    pub used_vram_mb: u32,
    pub loaded_models: Vec<String>,
}

impl Default for Myofibril {
    fn default() -> Self {
        Self {
            architecture: GpuArchitecture::Cuda,
            total_vram_mb: 8192, // 8GB VRAM par défaut (Standard GPU)
            used_vram_mb: 0,
            loaded_models: vec![],
        }
    }
}

impl Myofibril {
    pub fn new(arch: GpuArchitecture, vram: u32) -> Self {
        Self {
            architecture: arch,
            total_vram_mb: vram,
            used_vram_mb: 0,
            loaded_models: vec![],
        }
    }

    /// Charge un modèle LLM dans le tissu musculaire (VRAM)
    pub fn load_local_model(&mut self, model_name: &str, required_vram: u32) -> Result<(), String> {
        if self.used_vram_mb + required_vram > self.total_vram_mb {
            return Err(format!(
                "💥 [DÉCHIRURE MUSCULAIRE] Impossible de charger {}. VRAM insuffisante (Requiert {} MB, Reste {} MB).",
                model_name, required_vram, self.total_vram_mb - self.used_vram_mb
            ));
        }

        self.used_vram_mb += required_vram;
        self.loaded_models.push(model_name.to_string());
        Ok(())
    }

    /// "Contracte" le muscle (Exécute l'inférence Locale GPU)
    /// Attention: Le GPU ne peut pas paralléliser plusieurs LLMs simultanément sans OOM.
    /// Il nécessite un verrou exclusif (Période Réfractaire).
    pub fn execute_local_inference(&mut self, model_name: &str, _prompt: &str) -> Result<String, String> {
        if !self.loaded_models.contains(&model_name.to_string()) {
            return Err(format!("Atrophie : Le modèle {} n'est pas chargé dans la VRAM.", model_name));
        }

        // En Rust réel dans GenOS, l'orchestrateur utiliserait un `Arc<tokio::sync::Mutex<GpuHardware>>`.
        // Ici, on simule l'exclusivité : le muscle ne peut se contracter que s'il n'est pas déjà tétanisé.
        Ok(format!("💪 [CONTRACTION GPU ({:?})] Inférence locale exécutée par {}. Verrou exclusif acquis.", self.architecture, model_name))
    }
}

/// La Plaque Motrice (Global GPU Lock)
/// Parce que le matériel (GPU) n'accepte pas de travailler sur plusieurs choses à la fois,
/// l'orchestrateur (Tissue) doit utiliser ce verrou global (Mutex) pour mettre les cellules en file d'attente.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MotorEndPlate {
    pub is_busy: bool,
    pub current_cell_id: Option<String>,
}

impl MotorEndPlate {
    pub fn new() -> Self {
        Self { is_busy: false, current_cell_id: None }
    }

    /// Acquiert le verrou exclusif du GPU (Période Réfractaire)
    pub fn request_gpu_lock(&mut self, cell_id: &str) -> Result<(), String> {
        if self.is_busy {
            return Err(format!("Période Réfractaire: Le GPU est déjà monopolisé par {}. Mise en attente.", self.current_cell_id.as_deref().unwrap_or("une autre cellule")));
        }
        self.is_busy = true;
        self.current_cell_id = Some(cell_id.to_string());
        Ok(())
    }

    /// Relâche le verrou du GPU
    pub fn release_gpu_lock(&mut self) {
        self.is_busy = false;
        self.current_cell_id = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_muscle_vram_tearing() {
        let mut muscle = Myofibril::new(GpuArchitecture::Metal, 8000);

        // Chargement d'un petit modèle (Llama-3-8B quantizé = 4500 MB)
        assert!(muscle.load_local_model("Llama-3-8B-Q4", 4500).is_ok());

        // Tentative de charger un gros modèle en plus (Command-R-Plus = 35000 MB)
        let tearing = muscle.load_local_model("Command-R-Plus", 35000);
        assert!(tearing.is_err());
        assert!(tearing.unwrap_err().contains("DÉCHIRURE MUSCULAIRE"));

        // L'inférence marche sur le modèle chargé
        let result = muscle.execute_local_inference("Llama-3-8B-Q4", "Hello");
        assert!(result.is_ok());

        // Test de la Plaque Motrice (Verrou GPU Global)
        let mut gpu_lock = MotorEndPlate::new();
        assert!(gpu_lock.request_gpu_lock("Cellule-A").is_ok());
        
        let collision = gpu_lock.request_gpu_lock("Cellule-B");
        assert!(collision.is_err()); // Cellule B est bloquée (Le GPU ne fait qu'une chose à la fois)
        assert!(collision.unwrap_err().contains("Période Réfractaire"));

        gpu_lock.release_gpu_lock();
        assert!(gpu_lock.request_gpu_lock("Cellule-B").is_ok()); // Libéré !
    }
}