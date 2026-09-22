use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum EpigeneticMark {
    Methylation,
    Acetylation,
    Phosphorylation,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Mark {
    pub kind: EpigeneticMark,
    pub level: f64,
}

impl Mark {
    pub fn new(kind: EpigeneticMark, level: f64) -> Self {
        Self {
            kind,
            level: level.clamp(0.0, 1.0),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MarkParams {
    pub locus: String,
    pub kind: EpigeneticMark,
    pub level: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StressParams {
    pub signal: String,
    pub intensity: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum DevelopmentalStage {
    Zygote,
    Pluripotent,
    LineageCommitted,
    Differentiated,
    Mature,
    Senescent,
}

impl Default for DevelopmentalStage {
    fn default() -> Self {
        DevelopmentalStage::Zygote
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StressRecord {
    pub signal: String,
    pub intensity: f64,
    pub acquired_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Epigenome {
    pub marks: HashMap<String, Mark>,
    pub stage: DevelopmentalStage,
    pub stress_memory: Vec<StressRecord>,
    pub generation: u64,
}

impl Epigenome {
    pub fn new() -> Self {
        Self {
            marks: HashMap::new(),
            stage: DevelopmentalStage::Zygote,
            stress_memory: Vec::new(),
            generation: 0,
        }
    }

    pub fn with_generation(generation: u64) -> Self {
        Self {
            marks: HashMap::new(),
            stage: DevelopmentalStage::Zygote,
            stress_memory: Vec::new(),
            generation,
        }
    }

    pub fn add_mark(&mut self, params: MarkParams) {
        self.marks
            .insert(params.locus, Mark::new(params.kind, params.level));
    }

    pub fn get_mark(&self, locus: &str) -> Option<&Mark> {
        self.marks.get(locus)
    }

    pub fn is_methylated(&self, locus: &str) -> bool {
        self.marks.get(locus).map_or(false, |m| {
            m.kind == EpigeneticMark::Methylation && m.level > 0.5
        })
    }

    pub fn methylation_level(&self, locus: &str) -> f64 {
        self.marks.get(locus).map_or(0.0, |m| {
            if m.kind == EpigeneticMark::Methylation {
                m.level
            } else {
                0.0
            }
        })
    }

    pub fn record_stress(&mut self, params: StressParams) {
        self.stress_memory.push(StressRecord {
            signal: params.signal,
            intensity: params.intensity.clamp(0.0, 1.0),
            acquired_at: self.generation,
        });
    }

    pub fn advance_stage(&mut self) {
        self.stage = match self.stage {
            DevelopmentalStage::Zygote => DevelopmentalStage::Pluripotent,
            DevelopmentalStage::Pluripotent => DevelopmentalStage::LineageCommitted,
            DevelopmentalStage::LineageCommitted => DevelopmentalStage::Differentiated,
            DevelopmentalStage::Differentiated => DevelopmentalStage::Mature,
            DevelopmentalStage::Mature | DevelopmentalStage::Senescent => {
                DevelopmentalStage::Senescent
            }
        };
    }

    pub fn stress_level(&self) -> f64 {
        if self.stress_memory.is_empty() {
            return 0.0;
        }
        self.stress_memory.iter().map(|r| r.intensity).sum::<f64>() / self.stress_memory.len() as f64
    }

    pub fn inherits_from(parent: &Epigenome, stress_context: f64) -> Self {
        let mut child = Self::with_generation(parent.generation + 1);

        for (locus, mark) in &parent.marks {
            let inheritance_prob = match mark.kind {
                EpigeneticMark::Methylation => 0.7 - stress_context * 0.3,
                EpigeneticMark::Acetylation => 0.3,
                EpigeneticMark::Phosphorylation => 0.2,
            };
            if rand::random::<f64>() < inheritance_prob {
                let level = mark.level * (0.9 + rand::random::<f64>() * 0.2);
                child.add_mark(MarkParams {
                    locus: locus.clone(),
                    kind: mark.kind.clone(),
                    level,
                });
            }
        }

        for record in parent.stress_memory.iter().rev().take(3) {
            if record.intensity > 0.5 {
                child.record_stress(StressParams {
                    signal: record.signal.clone(),
                    intensity: record.intensity * 0.5,
                });
            }
        }

        child
    }
}

impl Default for Epigenome {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn epigenome_methylation_tracks_locus() {
        let mut epi = Epigenome::new();
        epi.add_mark(MarkParams {
            locus: "GENE_A".to_string(),
            kind: EpigeneticMark::Methylation,
            level: 0.8,
        });
        assert!(epi.is_methylated("GENE_A"));
        assert_eq!(epi.methylation_level("GENE_A"), 0.8);
        assert!(!epi.is_methylated("GENE_B"));
    }

    #[test]
    fn epigenome_stage_advances() {
        let mut epi = Epigenome::new();
        assert_eq!(epi.stage, DevelopmentalStage::Zygote);
        epi.advance_stage();
        assert_eq!(epi.stage, DevelopmentalStage::Pluripotent);
        epi.advance_stage();
        assert_eq!(epi.stage, DevelopmentalStage::LineageCommitted);
    }

    #[test]
    fn epigenome_stress_accumulates() {
        let mut epi = Epigenome::new();
        epi.record_stress(StressParams {
            signal: "heat".to_string(),
            intensity: 0.9,
        });
        epi.record_stress(StressParams {
            signal: "oxidative".to_string(),
            intensity: 0.5,
        });
        assert_eq!(epi.stress_memory.len(), 2);
        assert!(epi.stress_level() > 0.0);
    }

    #[test]
    fn epigenome_inheritance_partial() {
        let mut parent = Epigenome::with_generation(5);
        parent.add_mark(MarkParams {
            locus: "GENE_X".to_string(),
            kind: EpigeneticMark::Methylation,
            level: 0.9,
        });
        parent.record_stress(StressParams {
            signal: "drought".to_string(),
            intensity: 0.8,
        });

        let mut inherited = false;
        for _ in 0..100 {
            let child = Epigenome::inherits_from(&parent, 0.0);
            if child.is_methylated("GENE_X") {
                inherited = true;
                break;
            }
        }
        assert!(inherited, "Methylation should sometimes inherit");

        let child = Epigenome::inherits_from(&parent, 0.0);
        assert_eq!(child.generation, 6);
    }

    #[test]
    fn epigenome_different_same_genome() {
        let mut epi_a = Epigenome::new();
        epi_a.add_mark(MarkParams {
            locus: "TOOL_SEARCH".to_string(),
            kind: EpigeneticMark::Acetylation,
            level: 0.9,
        });
        epi_a.stage = DevelopmentalStage::Differentiated;

        let mut epi_b = Epigenome::new();
        epi_b.add_mark(MarkParams {
            locus: "TOOL_SEARCH".to_string(),
            kind: EpigeneticMark::Methylation,
            level: 0.9,
        });
        epi_b.stage = DevelopmentalStage::Pluripotent;

        assert_ne!(epi_a.marks["TOOL_SEARCH"].kind, epi_b.marks["TOOL_SEARCH"].kind);
        assert_ne!(epi_a.stage, epi_b.stage);
    }
}
