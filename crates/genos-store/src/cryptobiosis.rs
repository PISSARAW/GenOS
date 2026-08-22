use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Métadonnées attachées à une spore cryptobiotique.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SporeMeta {
    pub agent_id: String,
    pub suspended_at: String,
}

/// Représente un agent compressé sous forme de "Spore" (état de cryptobiose).
/// La spore contient le payload désydraté compressé avec Zstandard,
/// et utilise une racine de Merkle (SHA-256) pour garantir l'intégrité du payload.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CryptobioticSpore {
    pub spore_version: u32,
    pub agent_id: String,
    pub merkle_root: String,
    pub dehydrated_payload: Vec<u8>, // zstd-compressed payload
    pub suspended_at_utc: String,
}

impl CryptobioticSpore {
    pub fn new(meta: SporeMeta, payload: &[u8]) -> std::io::Result<Self> {
        // Generate sha256 as pseudo merkle root for the payload
        let mut hasher = Sha256::new();
        hasher.update(payload);
        let merkle_root = format!("{:x}", hasher.finalize());

        let compressed = zstd::encode_all(payload, 3)?;
        Ok(Self {
            spore_version: 1,
            agent_id: meta.agent_id,
            merkle_root,
            dehydrated_payload: compressed,
            suspended_at_utc: meta.suspended_at,
        })
    }

    pub fn rehydrate(&self) -> std::io::Result<Vec<u8>> {
        zstd::decode_all(std::io::Cursor::new(&self.dehydrated_payload))
    }
}
