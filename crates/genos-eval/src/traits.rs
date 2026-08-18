use serde::{Deserialize, Serialize};

/// Experimentally estimated expression of a trait. The estimate is evidence,
/// not a field copied from the genome.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TraitEstimate {
    pub trait_name: String,
    pub mean: f64,
    pub standard_error: f64,
    pub sample_size: usize,
    pub evaluation_suite: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RecombinedTraitTarget {
    pub trait_name: String,
    pub target: f64,
    pub parent_a_estimate: TraitEstimate,
    pub parent_b_estimate: TraitEstimate,
    pub parent_a_weight: f64,
}

/// Produce a breeding target from measured parental phenotypes. This does not
/// claim that the child expresses the target; a later evaluation must estimate
/// the child's phenotype independently.
pub fn recombine_measured_trait(
    parent_a: TraitEstimate,
    parent_b: TraitEstimate,
    parent_a_weight: f64,
) -> Result<RecombinedTraitTarget, String> {
    if parent_a.trait_name != parent_b.trait_name {
        return Err("parent estimates describe different traits".to_string());
    }
    if parent_a.evaluation_suite != parent_b.evaluation_suite {
        return Err("parent estimates were produced by different evaluation suites".to_string());
    }
    if !(0.0..=1.0).contains(&parent_a_weight) {
        return Err("parent_a_weight must be between 0 and 1".to_string());
    }
    let target = parent_a.mean * parent_a_weight + parent_b.mean * (1.0 - parent_a_weight);
    Ok(RecombinedTraitTarget {
        trait_name: parent_a.trait_name.clone(),
        target,
        parent_a_estimate: parent_a,
        parent_b_estimate: parent_b,
        parent_a_weight,
    })
}
