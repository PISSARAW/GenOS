use regex::Regex;
use serde_json::Value;

/// Trait pour normaliser le bruit environnemental dans les états de l'agent.
pub trait NoiseFilter: Send + Sync {
    /// Normalise la chaîne de caractères (ex: masque les PID, timestamps).
    fn normalize(&self, state_content: &str) -> String;

    /// Détermine si deux états sont sémantiquement équivalents après filtrage.
    fn is_equivalent(&self, golden_state: &str, current_state: &str) -> bool {
        self.normalize(golden_state) == self.normalize(current_state)
    }
}

/// Filtre les timestamps et les latences (Chronological Noise).
pub struct ChronologicalFilter {
    timestamp_re: Regex,
    latency_re: Regex,
}

impl ChronologicalFilter {
    pub fn new() -> Self {
        Self {
            // Match ISO8601 timestamps
            timestamp_re: Regex::new(
                r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})",
            )
            .unwrap(),
            // Match latencies like 50ms, 1.2s
            latency_re: Regex::new(r"\b\d+(\.\d+)?(ms|s)\b").unwrap(),
        }
    }
}

impl Default for ChronologicalFilter {
    fn default() -> Self {
        Self::new()
    }
}

impl NoiseFilter for ChronologicalFilter {
    fn normalize(&self, state_content: &str) -> String {
        let no_ts = self.timestamp_re.replace_all(state_content, "<TIMESTAMP>");
        self.latency_re.replace_all(&no_ts, "<LATENCY>").to_string()
    }
}

/// Filtre les UUIDs générés au vol et les chemins temporaires (Ephemeral IDs).
pub struct EphemeralIdFilter {
    uuid_re: Regex,
    tmp_re: Regex,
}

impl EphemeralIdFilter {
    pub fn new() -> Self {
        Self {
            // Match standard UUIDs
            uuid_re: Regex::new(
                r"(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            )
            .unwrap(),
            // Match /tmp/genos-1234 or \Temp\genos-1234
            tmp_re: Regex::new(r"(/tmp/|\\Temp\\)[A-Za-z0-9_-]+").unwrap(),
        }
    }
}

impl Default for EphemeralIdFilter {
    fn default() -> Self {
        Self::new()
    }
}

impl NoiseFilter for EphemeralIdFilter {
    fn normalize(&self, state_content: &str) -> String {
        let no_uuid = self.uuid_re.replace_all(state_content, "<UUID>");
        self.tmp_re.replace_all(&no_uuid, "<TMP_DIR>").to_string()
    }
}

/// Normalise la structure JSON (espacements, formatage).
pub struct StructuralFilter;

impl NoiseFilter for StructuralFilter {
    fn normalize(&self, state_content: &str) -> String {
        if let Ok(value) = serde_json::from_str::<Value>(state_content) {
            serde_json::to_string(&value).unwrap_or_else(|_| state_content.to_string())
        } else {
            state_content.to_string()
        }
    }
}

/// Moteur composite qui enchaîne plusieurs filtres.
pub struct CompositeNoiseFilter {
    filters: Vec<Box<dyn NoiseFilter>>,
}

impl CompositeNoiseFilter {
    pub fn new(filters: Vec<Box<dyn NoiseFilter>>) -> Self {
        Self { filters }
    }
}

impl NoiseFilter for CompositeNoiseFilter {
    fn normalize(&self, state_content: &str) -> String {
        let mut current = state_content.to_string();
        for filter in &self.filters {
            current = filter.normalize(&current);
        }
        current
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_noise_normalization() {
        let golden = r#"{"status": "ok", "latency": "50ms", "tmp": "/tmp/genos-123", "id": "123e4567-e89b-12d3-a456-426614174000"}"#;

        // Bruit introduit:
        // - latence de 200ms
        // - tmp folder a changé
        // - id a changé
        // - espaces différents
        let current = r#"{
            "status": "ok", 
            "latency": "200ms", 
            "tmp": "/tmp/genos-999", 
            "id": "987e6543-e21b-34c5-b678-426614174999"
        }"#;

        let composite = CompositeNoiseFilter::new(vec![
            Box::new(ChronologicalFilter::new()),
            Box::new(EphemeralIdFilter::new()),
            Box::new(StructuralFilter),
        ]);

        let norm_golden = composite.normalize(golden);
        let norm_current = composite.normalize(current);

        assert_eq!(norm_golden, norm_current, "Les états doivent être considérés comme sémantiquement équivalents après filtrage du bruit.");
        assert!(composite.is_equivalent(golden, current));
    }
}
