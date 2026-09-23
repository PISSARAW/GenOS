use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
pub struct ManifestMetadata {
    pub name: String,
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ManifestIdentity {
    pub role: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, rename = "name_meaning")]
    pub name_meaning: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct ManifestObjectives {
    #[serde(default)]
    pub primary: Option<String>,
    #[serde(default, rename = "source_doc")]
    pub source_doc: Option<String>,
    #[serde(default)]
    pub concepts: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct AllowedTools {
    #[serde(default, rename = "allowed_tools")]
    pub allowed_tools: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct ModelPolicy {
    #[serde(default)]
    pub preferred: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Manifest {
    #[serde(default, rename = "apiVersion")]
    pub api_version: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    pub metadata: ManifestMetadata,
    pub identity: ManifestIdentity,
    #[serde(default)]
    pub objectives: ManifestObjectives,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub tool_policy: Option<AllowedTools>,
    #[serde(default)]
    pub tools: Option<AllowedTools>,
    #[serde(default)]
    pub model_policy: Option<ModelPolicy>,
    #[serde(default)]
    pub models: Option<ModelPolicy>,
    #[serde(default)]
    pub cognition: Option<serde_json::Value>,
    #[serde(default)]
    pub memory_policy: Option<serde_json::Value>,
    #[serde(default)]
    pub memory: Option<serde_json::Value>,
    #[serde(default)]
    pub policies: Option<serde_json::Value>,
    #[serde(default)]
    pub objectives_block: Option<serde_json::Value>,
}

impl Manifest {
    pub fn display_name(&self) -> &str {
        self.metadata.name.as_str()
    }

    pub fn allowed_tools(&self) -> &[String] {
        if let Some(policy) = &self.tool_policy {
            return &policy.allowed_tools;
        }
        match &self.tools {
            Some(policy) => &policy.allowed_tools,
            None => &[],
        }
    }
}
