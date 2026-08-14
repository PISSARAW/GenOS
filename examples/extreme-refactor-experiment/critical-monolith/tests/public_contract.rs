use critical_monolith::*;

#[test]
fn behavior_stays_public() {
    assert_eq!(public_total(&[2, 3, 5]), 10);
    assert_eq!(public_version(), "v1");
}
