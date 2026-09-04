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
}
