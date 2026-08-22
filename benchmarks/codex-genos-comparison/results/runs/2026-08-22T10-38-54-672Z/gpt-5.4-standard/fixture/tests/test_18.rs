use buggy_service::PricingEngine;

#[test]
fn test_18_configuration_update_changes_the_quote() {
    let mut engine = PricingEngine::new(1.0);
    engine.update_configuration(1.5);
    assert_eq!(engine.quote(100.0), 150.0);
}
