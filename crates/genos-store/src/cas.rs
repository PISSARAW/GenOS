use async_trait::async_trait;
use genos_core::snapshot::CasHash;

/// Interface définissant le système de stockage orienté contenu (Content-Addressable Storage).
///
/// Indispensable pour l'architecture Copy-on-Write, le `CasStore` indexe les 
/// données non par leur nom ou ID de branche, mais par le hash SHA-256 de 
/// leur contenu réel. Les données dupliquées ne consomment ainsi qu'un seul bloc mémoire.
#[async_trait]
pub trait CasStore: Send + Sync {
    /// Sauvegarde une donnée et retourne son hash SHA-256
    async fn put(&self, data: &[u8]) -> anyhow::Result<CasHash>;
    
    /// Récupère une donnée via son hash
    async fn get(&self, hash: &CasHash) -> anyhow::Result<Option<Vec<u8>>>;
}
