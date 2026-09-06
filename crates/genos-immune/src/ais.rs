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

    /// Maturation d'affinité par expansion clonale et hypermutation somatique stochastique
    pub fn clonal_expansion_and_hypermutate(
        &mut self,
        antigen: &Antigen,
        clone_count: usize,
        mutation_rate: f64,
    ) -> ClonalExpansionResult {
        let mutation_rate = mutation_rate.clamp(0.0, 1.0);
        let clone_count = clone_count.clamp(1, 256);

        // Récupérer les paratopes de départ depuis les détecteurs actuels, la mémoire ou l'antigène
        let base_paratopes: Vec<String> = if !self.detectors.is_empty() {
            self.detectors.iter().map(|d| d.paratope.clone()).collect()
        } else if !self.memory_pool.is_empty() {
            self.memory_pool.iter().map(|m| m.paratope.clone()).collect()
        } else {
            vec![antigen.epitope.clone()]
        };

        use rand::RngExt;
        let mut rng = rand::rng();
        let charset = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
        let mut clones: Vec<AntibodyDetector> = Vec::with_capacity(clone_count);

        for i in 0..clone_count {
            let seed_paratope = &base_paratopes[i % base_paratopes.len()];
            let mut paratope_bytes = seed_paratope.as_bytes().to_vec();
            if paratope_bytes.is_empty() {
                paratope_bytes = b"GENOS".to_vec();
            }

            if mutation_rate > 0.0 {
                for b in &mut paratope_bytes {
                    if rng.random_bool(mutation_rate) {
                        let rand_idx = rng.random_range(0..charset.len());
                        *b = charset[rand_idx];
                    }
                }
            }

            let mutated_paratope = String::from_utf8_lossy(&paratope_bytes).to_string();
            let mut detector = AntibodyDetector::new(
                &format!("clone-hypermut-{}-{}", uuid::Uuid::new_v4().simple(), i),
                &mutated_paratope,
                0.5,
            );
            let aff = detector.compute_affinity(antigen);
            detector.affinity_threshold = (aff * 0.8).clamp(0.2, 0.9);
            clones.push(detector);
        }

        // Tri par affinité décroissante avec l'antigène
        clones.sort_by(|a, b| {
            let aff_b = b.compute_affinity(antigen);
            let aff_a = a.compute_affinity(antigen);
            aff_b.partial_cmp(&aff_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        let best_affinity = clones.first().map(|d| d.compute_affinity(antigen)).unwrap_or(0.0);

        // Intégrer les meilleurs clones matures dans le pool de détecteurs
        for top_clone in clones.iter().take(clone_count.min(10)) {
            if !self.detectors.iter().any(|d| d.paratope == top_clone.paratope) {
                self.detectors.push(top_clone.clone());
            }
        }

        // Si le niveau de danger est critique et qu'un clone mûr a une affinité significative, intégrer en mémoire
        if antigen.danger_level > 0.5 && best_affinity >= 0.2 {
            if let Some(best_clone) = clones.first() {
                if !self.memory_pool.iter().any(|m| m.paratope == best_clone.paratope) {
                    if self.memory_pool.len() >= MAX_MEMORY_DETECTORS {
                        self.memory_pool.remove(0);
                    }
                    self.memory_pool.push(best_clone.clone());
                }
            }
        }

        ClonalExpansionResult {
            clones_generated: clone_count,
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

