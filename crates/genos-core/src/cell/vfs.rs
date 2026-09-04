use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// L'État Quantique du Système de Fichiers (Cache L1 / MemFS)
/// Stocke uniquement les modifications (Deltas) pour permettre un Hyper-Fork instantané.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct QuantumVFS {
    /// Fichiers modifiés ou créés en RAM : Chemin -> Contenu
    pub deltas: HashMap<String, String>,
    /// Fichiers supprimés en RAM (Tombstones) : Empêche la lecture du fichier parent
    pub tombstones: HashSet<String>,
}

impl QuantumVFS {
    pub fn new() -> Self {
        Self {
            deltas: HashMap::new(),
            tombstones: HashSet::new(),
        }
    }

    /// Écrit ou modifie un fichier en RAM
    pub fn write_file(&mut self, path: &str, content: String) {
        self.tombstones.remove(path); // Ressuscite le fichier s'il était supprimé
        self.deltas.insert(path.to_string(), content);
    }

    /// Supprime un fichier en RAM (Pose une pierre tombale)
    pub fn delete_file(&mut self, path: &str) {
        self.deltas.remove(path);
        self.tombstones.insert(path.to_string());
    }

    /// Lit un fichier depuis la RAM.
    /// Retourne `Ok(Some(content))` s'il est modifié.
    /// Retourne `Ok(None)` s'il n'est pas modifié (laisser la couche L0 lire le vrai disque).
    /// Retourne `Err("Deleted")` s'il a été supprimé par l'agent.
    pub fn read_file(&self, path: &str) -> Result<Option<String>, &'static str> {
        if self.tombstones.contains(path) {
            return Err("File was deleted in this quantum branch");
        }
        if let Some(content) = self.deltas.get(path) {
            return Ok(Some(content.clone()));
        }
        Ok(None)
    }

    /// Intrication Quantique (Cherry-picking)
    /// Importe une modification spécifique d'une autre branche dans celle-ci.
    pub fn entangle_file(&mut self, other: &QuantumVFS, path: &str) {
        if other.tombstones.contains(path) {
            self.delete_file(path);
        } else if let Some(content) = other.deltas.get(path) {
            self.write_file(path, content.clone());
        }
    }
}
