use genos_synaptic::ampk::{AmpkAutomaton, AmpkConfig, AmpkMode, AtkinsonCharge};

#[test]
fn test_atkinson_energy_charge_and_hysteresis() {
    let charge_high = AtkinsonCharge::new(10.0, 2.0, 1.0);
    // (10 + 0.5 * 2) / (10 + 2 + 1) = 11 / 13 ~= 0.846
    let val_high = charge_high.energy_charge();
    assert!((val_high - 0.8461538).abs() < 1e-4);

    let config = AmpkConfig {
        catabolic_threshold: 0.60,
        conservation_threshold: 0.30,
        hysteresis: 0.05,
    };
    let mut automaton = AmpkAutomaton::new(config);
    assert_eq!(automaton.mode, AmpkMode::Anabolic);

    // Drop below catabolic_threshold - h (0.60 - 0.05 = 0.55)
    let charge_mid = AtkinsonCharge::new(4.0, 2.0, 5.0); // 5/11 ~= 0.454
    automaton.update_mode(&charge_mid);
    assert_eq!(automaton.mode, AmpkMode::Catabolic);

    // Drop below conservation_threshold - h (0.30 - 0.05 = 0.25)
    let charge_low = AtkinsonCharge::new(1.0, 1.0, 8.0); // 1.5/10 = 0.15
    automaton.update_mode(&charge_low);
    assert_eq!(automaton.mode, AmpkMode::Conservation);

    // Recover above conservation_threshold + h (0.30 + 0.05 = 0.35)
    let charge_rec = AtkinsonCharge::new(3.0, 2.0, 5.0); // 4/10 = 0.40
    automaton.update_mode(&charge_rec);
    assert_eq!(automaton.mode, AmpkMode::Catabolic);
}

#[test]
fn test_bft_quorum_and_intersection_math() {
    // 1. Exact canonical case where n = 3f + 1
    for f in 0..=30usize {
        let n = 3 * f + 1;
        let quorum_size = 2 * f + 1;
        let intersection = 2 * quorum_size - n;
        assert_eq!(intersection, f + 1);
        let honest_in_intersection = intersection - f;
        assert_eq!(honest_in_intersection, 1);
    }

    // 2. Demonstration of bug in docs/code for general n:
    // If code sets min_signers = 2f + 1 for n=5 or n=6, quorum intersection fails!
    let n_5 = 5usize;
    let f_5 = (n_5 - 1) / 3; // f = 1
    let broken_q_5 = 2 * f_5 + 1; // 3
    let broken_intersection_5 = 2 * broken_q_5 - n_5; // 3 + 3 - 5 = 1
    // Broken: only 1 node in intersection, and it can be Byzantine (f=1)!
    assert_eq!(broken_intersection_5 - f_5, 0); // ZERO guaranteed honest nodes!

    let n_6 = 6usize;
    let f_6 = (n_6 - 1) / 3; // f = 1
    let broken_q_6 = 2 * f_6 + 1; // 3
    let broken_intersection_6 = (2 * broken_q_6 as i32) - (n_6 as i32); // 0
    assert_eq!(broken_intersection_6, 0); // Completely disjoint quorums!

    // 3. The mathematically correct generalized BFT quorum formula: Q = (n + f)/2 + 1
    for n in 1..=100usize {
        let f = (n - 1) / 3;
        let correct_q = (n + f) / 2 + 1;
        assert!(correct_q <= n);
        let correct_intersection = 2 * correct_q - n;
        assert!(correct_intersection >= f + 1);
        let guaranteed_honest = correct_intersection - f;
        assert!(guaranteed_honest >= 1);
    }
}

#[test]
fn test_autoinducer_exponential_decay_dynamics() {
    let lambda = 0.1f32; // 10% decay per second
    let emissions = [(0.0f32, 1.0f32), (2.0f32, 0.8f32), (5.0f32, 1.2f32)];
    let t_curr = 6.0f32;

    let mut concentration = 0.0f32;
    for (t_i, alpha) in emissions {
        if t_curr >= t_i {
            concentration += alpha * (-lambda * (t_curr - t_i)).exp();
        }
    }

    // emission 1 at t=0: 1.0 * exp(-0.6) = 0.5488
    // emission 2 at t=2: 0.8 * exp(-0.4) = 0.5362
    // emission 3 at t=5: 1.2 * exp(-0.1) = 1.0858
    // Total approx = 2.1708
    assert!((concentration - 2.1708).abs() < 0.01);
}

#[test]
fn test_boids_flocking_lyapunov_energy() {
    let mut velocities = vec![
        [1.0f32, 2.0f32],
        [-1.0f32, 0.5f32],
        [3.0f32, -1.5f32],
        [0.0f32, 1.0f32],
    ];

    let compute_lyapunov = |vels: &[[f32; 2]]| -> f32 {
        let n = vels.len() as f32;
        let avg_vx = vels.iter().map(|v| v[0]).sum::<f32>() / n;
        let avg_vy = vels.iter().map(|v| v[1]).sum::<f32>() / n;
        0.5 * vels
            .iter()
            .map(|v| (v[0] - avg_vx).powi(2) + (v[1] - avg_vy).powi(2))
            .sum::<f32>()
    };

    let mut energy_prev = compute_lyapunov(&velocities);
    let dt = 0.4f32;

    for _ in 0..15 {
        let n = velocities.len() as f32;
        let avg_vx = velocities.iter().map(|v| v[0]).sum::<f32>() / n;
        let avg_vy = velocities.iter().map(|v| v[1]).sum::<f32>() / n;

        for v in &mut velocities {
            v[0] += (avg_vx - v[0]) * dt;
            v[1] += (avg_vy - v[1]) * dt;
        }

        let energy_curr = compute_lyapunov(&velocities);
        assert!(energy_curr <= energy_prev + 1e-6);
        energy_prev = energy_curr;
    }

    assert!(energy_prev < 0.001);
}
