#[cfg(test)]
mod tests {
    use genos_core::cost::CostSchema;
    use genos_core::audit_bundle::AuditBundle;
    use genos_runtime::conditional_merge::{ConditionalMergeHarness, PolicyContext};
    use genos_core::ids::BranchId;

    #[test]
    fn test_cost_schema() {
        let mut cost1 = CostSchema { prompt_tokens: 10, ..Default::default() };
        let cost2 = CostSchema { prompt_tokens: 20, ..Default::default() };
        cost1.add(&cost2);
        assert_eq!(cost1.prompt_tokens, 30);
    }

    #[test]
    fn test_audit_bundle() {
        let bundle = AuditBundle::new("rev1".to_string(), "env1".to_string());
        assert_eq!(bundle.revision, "rev1");
    }

    #[test]
    fn test_conditional_merge() {
        let policy = PolicyContext { max_cost: Some(100), require_tests_pass: true, security_gates: false };
        let harness = ConditionalMergeHarness::new(policy);
        let branch = BranchId::new();
        
        // Pass
        assert!(harness.evaluate_branch(&branch, 50, true, true).is_ok());
        
        // Fail cost
        assert!(harness.evaluate_branch(&branch, 150, true, true).is_err());
        
        // Fail tests
        assert!(harness.evaluate_branch(&branch, 50, false, true).is_err());
    }
}
