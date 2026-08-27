#[cfg(test)]
mod tests {
    use genos_core::audit_bundle::AuditBundle;
    use genos_core::cost::CostSchema;
    use genos_core::ids::BranchId;
    use genos_runtime::conditional_merge::{BranchMetrics, ConditionalMergeHarness, PolicyContext};

    #[test]
    fn test_cost_schema() {
        let mut cost1 = CostSchema {
            prompt_tokens: 10,
            ..Default::default()
        };
        let cost2 = CostSchema {
            prompt_tokens: 20,
            ..Default::default()
        };
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
        let policy = PolicyContext {
            max_cost: Some(100),
            require_tests_pass: true,
            security_gates: false,
        };
        let harness = ConditionalMergeHarness::new(policy);
        let branch = BranchId::new();

        // Pass
        let metrics1 = BranchMetrics {
            current_cost: 50,
            tests_passed: true,
            security_passed: true,
        };
        assert!(harness.evaluate_branch(&branch, &metrics1).is_ok());

        // Fail cost
        let metrics2 = BranchMetrics {
            current_cost: 150,
            tests_passed: true,
            security_passed: true,
        };
        assert!(harness.evaluate_branch(&branch, &metrics2).is_err());

        // Fail tests
        let metrics3 = BranchMetrics {
            current_cost: 50,
            tests_passed: false,
            security_passed: true,
        };
        assert!(harness.evaluate_branch(&branch, &metrics3).is_err());
    }
}
