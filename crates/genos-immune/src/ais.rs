use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;

const MAX_MEMORY_DETECTORS: usize = 256;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Antigen {
    pub id: String,
    pub epitope: String,
    pub danger_level: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AntibodyDetector {
    pub id: String,
    pub paratope: String,
    pub affinity_threshold: f64,
}

impl AntibodyDetector {
    pub fn new(id: &str, paratope: &str, affinity_threshold: f64) -> Self {
        let affinity_threshold = if affinity_threshold.is_finite() {
            affinity_threshold.clamp(0.0, 1.0)
        } else {
            1.0
        };
        Self {
            id: id.to_string(),
            paratope: paratope.to_string(),
            affinity_threshold,
        }
    }

    pub fn compute_affinity(&self, antigen: &Antigen) -> f64 {
        if antigen.epitope.contains(&self.paratope) {
            return 1.0;
        }
        let p_bytes = self.paratope.as_bytes();
        let e_bytes = antigen.epitope.as_bytes();
        let matches = p_bytes
            .iter()
            .zip(e_bytes.iter())
            .filter(|&(a, b)| a == b)
            .count();
        let len = std::cmp::max(p_bytes.len(), e_bytes.len());
        if len == 0 {
            0.0
        } else {
            matches as f64 / len as f64
        }
    }

    pub fn matches(&self, antigen: &Antigen) -> bool {
        self.compute_affinity(antigen) >= self.affinity_threshold
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClonalSelection {
    pub detectors: Vec<AntibodyDetector>,
    pub memory_pool: Vec<AntibodyDetector>,
}

impl Default for ClonalSelection {
    fn default() -> Self {
        Self::new()
    }
}

impl ClonalSelection {
    pub fn new() -> Self {
        Self {
            detectors: Vec::new(),
            memory_pool: Vec::new(),
        }
    }

    pub fn load(path: impl AsRef<Path>) -> io::Result<Self> {
        let content = fs::read_to_string(path)?;
        serde_json::from_str(&content).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
    }

    pub fn save(&self, path: impl AsRef<Path>) -> io::Result<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string(self).map_err(io::Error::other)?;
        fs::write(path, content)
    }

    pub fn recognize(&mut self, antigen: &Antigen) -> bool {
        for detector in &self.detectors {
            if detector.matches(antigen) {
                if antigen.danger_level > 0.5 {
                    if !self.memory_pool.iter().any(|memory| memory.id == detector.id) {
                        if self.memory_pool.len() >= MAX_MEMORY_DETECTORS {
                            self.memory_pool.remove(0);
                        }
                        self.memory_pool.push(detector.clone());
                    }
                }
                return true;
            }
        }
        for memory in &self.memory_pool {
            if memory.matches(antigen) {
                return true;
            }
        }
        false
    }
}
