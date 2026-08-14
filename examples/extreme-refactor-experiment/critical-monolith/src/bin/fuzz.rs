fn main() {
    for a in -100..100 {
        for b in -10..10 {
            assert_eq!(critical_monolith::public_total(&[a, b]), a + b);
        }
    }
    println!("fuzz_ok");
}
