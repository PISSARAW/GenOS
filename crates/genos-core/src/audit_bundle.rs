use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditBundle {
    pub revision: String,
    pub environment: String,
    pub commands: Vec<String>,
    pub events: Vec<String>,
    pub results: String,
}

impl AuditBundle {
    pub fn new(revision: String, environment: String) -> Self {
        Self {
            revision,
            environment,
            commands: Vec::new(),
            events: Vec::new(),
            results: String::new(),
        }
    }

    pub fn export(&self) -> String {
        serde_json::to_string_pretty(self).unwrap_or_default()
    }
}
