use std::path::{Path, PathBuf};
use crate::cell::vfs::QuantumVFS;

/// Le CapsuleManager
/// Gère la matérialisation physique (JIT Sandboxing) d'une branche quantique
/// pour permettre l'exécution d'outils OS réels (compilateurs, linters, tests).
pub struct CapsuleManager {
    pub base_path: PathBuf,
}

impl Default for CapsuleManager {
    fn default() -> Self {
        Self {
            base_path: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
        }
    }
}

impl CapsuleManager {
    pub fn new(base_path: &Path) -> Self {
        Self {
            base_path: base_path.to_path_buf(),
        }
    }

    /// Extrait le VFS en RAM dans un vrai dossier temporaire sur le disque.
    /// Exécute un closure `execution_block` à l'intérieur, puis nettoie le dossier.
    pub fn execute_jit<F, R>(&self, vfs: &QuantumVFS, execution_block: F) -> Result<R, String>
    where
        F: FnOnce(&Path) -> Result<R, String>,
    {
        let jit_id = uuid::Uuid::new_v4().to_string();
        let jit_dir = std::env::temp_dir().join(format!("genos_jit_{}", jit_id));
        
        // 1. Matérialisation (Fast Copy)
        // Clone le socle (L0) sans les dossiers lourds.
        if let Err(e) = Self::copy_dir_recursive_filtered(&self.base_path, &jit_dir) {
            return Err(format!("Erreur lors de la création du JIT Sandbox : {}", e));
        }

        // 2. Application du QuantumVFS (Écrasement des fichiers par les deltas en RAM)
        for (rel_path, content) in &vfs.deltas {
            let target_file = jit_dir.join(rel_path);
            if let Some(parent) = target_file.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&target_file, content);
        }
        
        // Suppression des tombstones (Fichiers supprimés virtuellement en RAM)
        for tombstone in &vfs.tombstones {
            let target_file = jit_dir.join(tombstone);
            let _ = std::fs::remove_file(target_file);
        }

        println!("📦 [CapsuleManager] JIT Sandbox préparée : {}", jit_dir.display());

        // 3. Exécution du bloc (le compilateur ou le test unitaire agit sur jit_dir)
        let result = execution_block(&jit_dir);

        // 4. Nettoyage
        // TODO: Implémenter le Fast Diffing ici pour rapatrier les changements 
        // générés par la commande vers le VFS avant de détruire le dossier.
        let _ = std::fs::remove_dir_all(&jit_dir);
        println!("🧹 [CapsuleManager] JIT Sandbox détruite.");

        result
    }

    /// Copie récursive qui ignore les gros dossiers (target, node_modules, .git)
    /// pour accélérer massivement la création du JIT.
    fn copy_dir_recursive_filtered(src: &Path, dst: &Path) -> std::io::Result<()> {
        if !dst.exists() {
            std::fs::create_dir_all(dst)?;
        }

        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Ignore les dossiers lourds ou inutiles pour accélérer le JIT
            if file_name == "target" || file_name == "node_modules" || file_name == ".git" || file_name == "tmp" {
                continue;
            }

            let dest_path = dst.join(entry.file_name());
            if path.is_dir() {
                Self::copy_dir_recursive_filtered(&path, &dest_path)?;
            } else {
                std::fs::copy(&path, &dest_path)?;
            }
        }
        Ok(())
    }

    /// L'ARBITRAGE DE LA RÉALITÉ (Thermodynamique Infalsifiable)
    /// Exécute un test physique (ex: `cargo check`) via le JIT Sandboxing.
    /// Écrase toute illusion ou consensus des LLMs : si ça casse dans le monde réel, 
    /// la branche subit une dissonance fatale (Apoptose).
    pub fn arbitrate_reality(&self, cell: &mut crate::cell::AgentCell, command: &str, args: &[&str]) -> bool {
        let vfs = cell.mind().unwrap().cognitive_state.quantum_vfs.clone();
        
        let reality_result = self.execute_jit(&vfs, |jit_dir| {
            let status = std::process::Command::new(command)
                .args(args)
                .current_dir(jit_dir)
                .output()
                .map_err(|e| e.to_string())?;
                
            if status.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&status.stderr);
                Err(format!("Code de sortie non-zéro.\nErreur: {}", stderr))
            }
        });

        match reality_result {
            Ok(_) => {
                println!("🌍 [Arbitre de Réalité] Validation Thermodynamique : Le code de la branche {} compile et fonctionne.", cell.cell_id);
                // La réalité valide l'intuition de l'agent. Boost massif.
                cell.conscience.eureka_moments += 1;
                cell.conscience.current_budget += 30.0;
                true
            }
            Err(err) => {
                println!("💥 [Arbitre de Réalité] COLLISION AVEC LA RÉALITÉ (Branche {}) : {}", cell.cell_id, err);
                // Peu importe à quel point l'agent (ou les autres LLMs) était convaincu de son code,
                // la réalité physique s'impose. La dissonance explose et la cellule meurt.
                cell.conscience.dissonance_level += 500.0; 
                cell.conscience.is_apoptotic = true;       // Apoptose forcée immédiate
                false
            }
        }
    }
}
