use async_trait::async_trait;
use serde::{Deserialize, Serialize};

/// L'état caché $O(1)$ de Mamba-2 (environ 8Ko)
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SsmHiddenState {
    pub data: Vec<u8>,
}

#[async_trait]
pub trait SsmBackend: Send + Sync {
    /// Injecte un état caché préexistant dans le modèle
    async fn inject_state(&self, state: &SsmHiddenState) -> anyhow::Result<()>;
    
    /// Extrait l'état caché courant (pour sauvegarde dans le CoW CAS)
    async fn extract_state(&self) -> anyhow::Result<SsmHiddenState>;
    
    /// Inférence d'une séquence
    async fn forward(&self, tokens: &[u32]) -> anyhow::Result<Vec<f32>>;
}
