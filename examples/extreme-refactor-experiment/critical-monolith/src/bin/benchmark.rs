fn main() {
    let mut value = 0;
    for _ in 0..10_000 {
        value = critical_monolith::public_total(&[value, 1]);
    }
    assert_eq!(value, 10_000);
    println!("benchmark_ok");
}
