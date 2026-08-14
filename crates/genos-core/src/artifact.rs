use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DigestAlgorithm {
    Sha256,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArtifactRef {
    pub algorithm: DigestAlgorithm,
    pub digest: String,
    pub media_type: String,
    pub size: u64,
}
