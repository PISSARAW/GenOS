use crate::schema::object_schema;
use crate::spec_builder::SpecBuilder;
use crate::types::ToolSpec;

pub fn hallucination_specs() -> Vec<ToolSpec> {
    vec![
        SpecBuilder::new("hallucination_detect", "Detect Hallucinations", "Scan for missing execution receipts.")
            .schema(object_schema([], &[]))
            .build(),
        SpecBuilder::new("hallucination_inject", "Inject Hallucinations", "Inject false premises for red teaming.")
            .schema(object_schema([], &[]))
            .build(),
        SpecBuilder::new("hallucination_test", "Test Hallucinations", "Run ImpossibleBench tests.")
            .schema(object_schema([], &[]))
            .build(),
        SpecBuilder::new("hallucination_extract", "Extract Hallucinations", "Export beliefs to JSON.")
            .schema(object_schema([], &[]))
            .build(),
        SpecBuilder::new("hallucination_analyze", "Analyze Hallucinations", "Analyze a trajectory with semantic entropy.")
            .schema(object_schema([], &[]))
            .build(),
        SpecBuilder::new("hallucination_correct", "Correct Hallucinations", "Correct hallucinations with process supervision.")
            .schema(object_schema([], &[]))
            .build(),
        SpecBuilder::new("hallucination_simulate", "Simulate Hallucinations", "Simulate hallucinations in an isolated world.")
            .schema(object_schema([], &[]))
            .build(),
    ]
}
