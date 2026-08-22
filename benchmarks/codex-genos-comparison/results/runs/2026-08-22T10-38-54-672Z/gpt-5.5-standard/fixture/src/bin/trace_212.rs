use buggy_service::PricingEngine;

fn main() {
    let mut engine = PricingEngine::new(1.0);
    engine.update_configuration(1.5);
    if engine.trace_is_fresh() {
        println!("trace 212: configuration propagated to quote state");
    } else {
        eprintln!("trace 212: source_rate=1.5 cached_rate=1.0");
        std::process::exit(212);
    }
}
