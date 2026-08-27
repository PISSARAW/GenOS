use genos_core::causality::CausalBoundary;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CausalAnalysisReport {
    pub boundaries_analyzed: usize,
    pub root_causes: Vec<String>,
}

pub fn analyze_causal_boundaries(boundaries: &[CausalBoundary]) -> CausalAnalysisReport {
    CausalAnalysisReport {
        boundaries_analyzed: boundaries.len(),
        root_causes: boundaries.iter().map(|b| b.boundary_id.clone()).collect(),
    }
}
