use buggy_service::PricingEngine;

#[test]
fn production_sequence_is_no_longer_reproducible() {
    let mut engine = PricingEngine::new(0.8);
    engine.update_configuration(1.2);
    assert_eq!(engine.quote(250.0), 300.0);
    assert!(engine.trace_is_fresh());
}
