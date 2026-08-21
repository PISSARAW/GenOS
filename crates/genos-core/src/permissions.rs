use serde::{Deserialize, Serialize};

/// Manifeste de permissions décrivant les accès autorisés (fichiers, réseau).
/// Utilisé pour garantir le sandboxing strict de l'environnement (Zero Trust).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PermissionsManifest {
    /// Chemins de fichiers ou répertoires autorisés en lecture.
    pub read_paths: Vec<String>,
    /// Chemins de fichiers ou répertoires autorisés en écriture.
    pub write_paths: Vec<String>,
    /// Domaines réseau (URL/IP) autorisés pour les appels externes.
    pub allowed_domains: Vec<String>,
}

impl PermissionsManifest {
    /// Crée un manifeste de permissions vide par défaut.
    pub fn new() -> Self {
        Self::default()
    }
}
