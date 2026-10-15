use super::*;

#[test]
fn compiled_native_plan_matches_interpreter_for_validated_batch() {
    let mut target = Tracheid::new("native-test-target");
    target.trigger_lignified_apoptosis("pipeline:native-test").unwrap();
    let plan = TracheidExecutionPlan::new(
        "pipeline:native-test",
        target.plate.cavitation_resistance_mpa,
    )
    .unwrap();
    let inputs = [
        TracheidPlanInput { volume: 8.5, tension_mpa: -4.5 },
        TracheidPlanInput { volume: 8.5, tension_mpa: -7.0 },
        TracheidPlanInput { volume: 0.0, tension_mpa: -6.5 },
    ];
    let scratch = tempfile::tempdir().unwrap();
    let report = compile_and_run(NativeRequest {
        plan: &plan,
        target: &target,
        inputs: &inputs,
        scratch_root: scratch.path(),
    })
    .unwrap();
    assert_eq!(report.results.len(), inputs.len());
    assert!(report.compile_micros > 0);
    assert!(report.process_micros > 0);
    assert!(report.scratch_path.starts_with(&report.scratch_root));
    assert!(!report.scratch_path.exists());
    for (input, result) in inputs.iter().zip(&report.results) {
        let expected = execute_tracheid_plan(&plan, &target, *input).unwrap();
        assert_eq!(result.transported_volume, expected.transported_volume);
        assert_eq!(result.tension_applied_mpa, expected.tension_applied_mpa);
        assert_eq!(result.cavitation_detected, expected.cavitation_detected);
        assert_eq!(result.token_cost, expected.token_cost);
        assert_eq!(result.conduit_state, expected.conduit_state);
    }
}

#[test]
fn code_generation_rejects_malformed_plan_without_embedding_pipeline_text() {
    let mut plan = TracheidExecutionPlan::new("pipeline:quoted\"text", -6.5).unwrap();
    let source = generate_source(&plan).unwrap();
    assert!(!source.contains("quoted"));
    plan.operations.reverse();
    assert!(generate_source(&plan).is_err());
}

#[test]
fn native_batch_refuses_invalid_or_unbounded_inputs_before_compiling() {
    let mut target = Tracheid::new("native-invalid-target");
    target.trigger_lignified_apoptosis("pipeline:native-invalid").unwrap();
    let plan = TracheidExecutionPlan::new(
        "pipeline:native-invalid",
        target.plate.cavitation_resistance_mpa,
    )
    .unwrap();
    let empty: [TracheidPlanInput; 0] = [];
    assert!(validate_batch(&NativeRequest {
        plan: &plan,
        target: &target,
        inputs: &empty,
        scratch_root: Path::new("."),
    })
    .is_err());
    let invalid = [TracheidPlanInput { volume: f64::NAN, tension_mpa: 0.0 }];
    assert!(validate_batch(&NativeRequest {
        plan: &plan,
        target: &target,
        inputs: &invalid,
        scratch_root: Path::new("."),
    })
    .is_err());
    let oversized = vec![
        TracheidPlanInput {
            volume: 1.0,
            tension_mpa: 0.0,
        };
        MAX_BATCH + 1
    ];
    assert!(validate_batch(&NativeRequest {
        plan: &plan,
        target: &target,
        inputs: &oversized,
        scratch_root: Path::new("."),
    })
    .is_err());
}
