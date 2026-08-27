use genos_core::ids::BranchId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyContext {
    pub max_cost: Option<u64>,
    pub require_tests_pass: bool,
    pub security_gates: bool,
}

pub struct ConditionalMergeHarness {
    pub policies: PolicyContext,
}

impl ConditionalMergeHarness {
    pub fn new(policies: PolicyContext) -> Self {
        Self { policies }
    }

    pub fn evaluate_branch(&self, branch_id: &BranchId, current_cost: u64, tests_passed: bool, security_passed: bool) -> Result<(), String> {
        if let Some(max_cost) = self.policies.max_cost {
            if current_cost > max_cost {
                return Err(format!("Max cost exceeded: {} > {}", current_cost, max_cost));
            }
        }
        
        if self.policies.require_tests_pass && !tests_passed {
            return Err("Tests did not pass".to_string());
        }

        if self.policies.security_gates && !security_passed {
            return Err("Security gates failed".to_string());
        }
        
        Ok(())
    }
}
