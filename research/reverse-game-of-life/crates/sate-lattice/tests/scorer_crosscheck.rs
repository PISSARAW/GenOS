use sate_lattice::scorer::Scorer;
use sate_lattice::constructions::concentric_rings::generate_concentric_rings;
use sate_lattice::brute_force::brute_force_exact;

#[test]
fn test_ring_construction_n20() {
    let n = 20;
    let scorer = generate_concentric_rings(n);
    let result = scorer.evaluate();
    
    assert_eq!(result.alive, 220);
    assert_eq!(result.overloaded, 0);
    assert_eq!(result.soft_score, 220);
    assert!(result.is_valid_strict);
}

#[test]
fn test_ring_construction_n4() {
    let n = 4;
    let scorer = generate_concentric_rings(n);
    let result = scorer.evaluate();
    
    assert_eq!(result.alive, 12);
    assert_eq!(result.overloaded, 0);
}

#[test]
fn test_brute_force_small_n() {
    // For N=1, optimum is 1
    let (_, res1) = brute_force_exact(1);
    assert_eq!(res1.soft_score, 1);
    assert_eq!(res1.overloaded, 0);
    
    // For N=2, optimum is 4
    let (_, res2) = brute_force_exact(2);
    assert_eq!(res2.soft_score, 4);
    assert_eq!(res2.overloaded, 0);
    
    // For N=3, optimum is 6
    let (_, res3) = brute_force_exact(3);
    assert_eq!(res3.soft_score, 6);
    assert_eq!(res3.overloaded, 0);
}
