use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;

#[path = "hypermut.rs"]
mod hypermute;

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

    fn check_detectors(&self, antigen: &Antigen) -> Option<&AntibodyDetector> {
        for detector in &self.detectors {
            if detector.matches(antigen) {
                return Some(detector);
            }
        }
        None
    }

    fn check_memory(&self, antigen: &Antigen) -> bool {
        self.memory_pool.iter().any(|memory| memory.matches(antigen))
    }

    fn maybe_memorize(&mut self, detector: &AntibodyDetector, antigen: &Antigen) {
        if antigen.danger_level <= 0.5 {
            return;
        }
        if self.memory_pool.iter().any(|memory| memory.id == detector.id) {
            return;
        }
        if self.memory_pool.len() >= MAX_MEMORY_DETECTORS {
            self.memory_pool.remove(0);
        }
        self.memory_pool.push(detector.clone());
    }

    pub fn recognize(&mut self, antigen: &Antigen) -> bool {
        let hit = match self.check_detectors(antigen) {
            Some(d) => Some(d.clone()),
            None => None,
        };
        match hit {
            Some(detector) => {
                self.maybe_memorize(&detector, antigen);
                true
            }
            None => self.check_memory(antigen),
        }
    }

    fn base_paratopes(&self, antigen: &Antigen) -> Vec<String> {
        if !self.detectors.is_empty() {
            return self.detectors.iter().map(|d| d.paratope.clone()).collect();
        }
        if !self.memory_pool.is_empty() {
            return self.memory_pool.iter().map(|m| m.paratope.clone()).collect();
        }
        vec![antigen.epitope.clone()]
    }

    fn integrate_top_clones(&mut self, clones: &[AntibodyDetector], clone_count: usize) {
        for top_clone in clones.iter().take(clone_count.min(10)) {
            if !self.detectors.iter().any(|d| d.paratope == top_clone.paratope) {
                self.detectors.push(top_clone.clone());
            }
        }
    }

    fn should_memorize(antigen: &Antigen, best_affinity: f64) -> bool {
        antigen.danger_level > 0.5 && best_affinity >= 0.2
    }

    fn push_memory_clone(&mut self, clone: &AntibodyDetector) {
        if self.memory_pool.iter().any(|m| m.paratope == clone.paratope) {
            return;
        }
        if self.memory_pool.len() >= MAX_MEMORY_DETECTORS {
            self.memory_pool.remove(0);
        }
        self.memory_pool.push(clone.clone());
    }

    fn integrate_memory(&mut self, clones: &[AntibodyDetector], antigen: &Antigen, best_affinity: f64) {
        if !Self::should_memorize(antigen, best_affinity) {
            return;
        }
        if let Some(best) = clones.first() {
            self.push_memory_clone(best);
        }
    }

    /// Maturation d'affinité par expansion clonale et hypermutation somatique stochastique
    pub fn clonal_expansion_and_hypermutate(
        &mut self,
        antigen: &Antigen,
        clone_count: usize,
        mutation_rate: f64,
    ) -> ClonalExpansionResult {
        let params = hypermute::HypermutParams {
            mutation_rate: mutation_rate.clamp(0.0, 1.0),
            clone_count: clone_count.clamp(1, 256),
        };
        let base = self.base_paratopes(antigen);
        let mut clones = hypermute::generate_clones(&base, &params, antigen);
        hypermute::sort_by_affinity(&mut clones, antigen);
        let best_affinity = hypermute::best_affinity(&clones, antigen);
        self.integrate_top_clones(&clones, params.clone_count);
        self.integrate_memory(&clones, antigen, best_affinity);
        ClonalExpansionResult {
            clones_generated: params.clone_count,
            matured_detectors: clones,
            best_affinity,
            memory_pool_size: self.memory_pool.len(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClonalExpansionResult {
    pub clones_generated: usize,
    pub matured_detectors: Vec<AntibodyDetector>,
    pub best_affinity: f64,
    pub memory_pool_size: usize,
}

