use std::collections::HashSet;

use super::types::{ClaimRelation, CognitiveClaim, CognitiveMergeConfig};

pub(crate) fn validate_inputs(
    claims: &[CognitiveClaim],
    relations: &[ClaimRelation],
    config: &CognitiveMergeConfig,
) -> Result<(), String> {
    if claims.is_empty() {
        return Err("cognitive merge requires at least one claim".to_string());
    }
    if !(0.0..=1.0).contains(&config.acceptance_threshold)
        || config.minimum_independent_branches == 0
    {
        return Err("invalid cognitive merge configuration".to_string());
    }
    let mut ids = HashSet::new();
    for claim in claims {
        if !ids.insert(claim.claim_id.clone()) {
            return Err(format!("duplicate claim id {}", claim.claim_id));
        }
        if !(0.0..=1.0).contains(&claim.confidence) || claim.evidence.is_empty() {
            return Err(format!(
                "claim {} needs bounded confidence and evidence",
                claim.claim_id
            ));
        }
    }
    for relation in relations {
        if !ids.contains(&relation.from_claim)
            || !ids.contains(&relation.to_claim)
            || !(0.0..=1.0).contains(&relation.confidence)
            || relation.evidence.is_empty()
        {
            return Err("relation references unknown claims or lacks evidence".to_string());
        }
    }
    Ok(())
}
