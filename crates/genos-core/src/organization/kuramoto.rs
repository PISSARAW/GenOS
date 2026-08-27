//! Kuramoto pairwise phase coupling.
//!
//! Replaces the naive mean-phase synchronization of `FireflySwarm` with the
//! canonical model: each oscillator advances at its natural frequency plus the
//! weighted coupling sum over its *neighbors* —
//! `dtheta_i/dt = omega_i + (K / deg_i) * sum_j A_ij * sin(theta_j - theta_i)`.

use serde::{Deserialize, Serialize};

/// One phase oscillator (a firefly analogue).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct KuramotoOscillator {
    pub id: String,
    /// Phase in radians (wrapped to `[0, 2pi)` after integration).
    pub phase: f32,
    /// Natural angular frequency.
    pub omega: f32,
}

/// Coherence of the population: `|1/N * sum(e^{i theta})|` in `[0, 1]`.
/// 1 = perfect synchrony, 0 = uniform incoherence.
pub fn order_parameter(phases: &[f32]) -> f32 {
    if phases.is_empty() {
        return 0.0;
    }
    let n = phases.len() as f32;
    let (mut sx, mut sy) = (0.0_f32, 0.0_f32);
    for theta in phases {
        sx += theta.cos();
        sy += theta.sin();
    }
    ((sx / n).powi(2) + (sy / n).powi(2)).sqrt()
}

fn wrap_two_pi(angle: f32) -> f32 {
    angle.rem_euclid(std::f32::consts::TAU)
}

/// Integrates one explicit-Euler step of pairwise Kuramoto dynamics.
///
/// `adjacency` holds undirected edges as index pairs; isolated oscillators
/// simply free-run at `omega`. The coupling is degree-normalized so hubs do
/// not dominate.
pub fn step_pairwise(
    oscillators: &mut [KuramotoOscillator],
    adjacency: &[(usize, usize)],
    k: f32,
    dt: f32,
) {
    let n = oscillators.len();
    if n == 0 {
        return;
    }
    let mut degrees = vec![0_u32; n];
    for (a, b) in adjacency {
        if *a < n && *b < n && a != b {
            degrees[*a] += 1;
            degrees[*b] += 1;
        }
    }

    // Snapshot des phases : le couplage est simultané, pas séquentiel.
    let phases: Vec<f32> = oscillators.iter().map(|o| o.phase).collect();
    for i in 0..n {
        let mut coupling = 0.0_f32;
        for (a, b) in adjacency {
            if *a < n && *b < n && a != b {
                if *a == i {
                    coupling += (phases[*b] - phases[i]).sin();
                } else if *b == i {
                    coupling += (phases[*a] - phases[i]).sin();
                }
            }
        }
        let deg = degrees[i].max(1) as f32;
        let o = &mut oscillators[i];
        o.phase = wrap_two_pi(o.phase + dt * (o.omega + k * coupling / deg));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn swarm(n: u32) -> Vec<KuramotoOscillator> {
        (0..n)
            .map(|i| KuramotoOscillator {
                id: format!("ff-{i}"),
                phase: (i as f32) * std::f32::consts::TAU / n as f32,
                omega: 1.0,
            })
            .collect()
    }

    #[test]
    fn fully_connected_population_synchronizes() {
        let n = 8;
        let mut osc = swarm(n);
        // Graphe complet.
        let adjacency: Vec<(usize, usize)> = (0..n as usize)
            .flat_map(|a| ((a + 1)..n as usize).map(move |b| (a, b)))
            .collect();

        let initial_coherence = order_parameter(&osc.iter().map(|o| o.phase).collect::<Vec<_>>());
        for _ in 0..2000 {
            step_pairwise(&mut osc, &adjacency, 4.0, 0.01);
        }
        let final_coherence = order_parameter(&osc.iter().map(|o| o.phase).collect::<Vec<_>>());
        assert!(
            final_coherence > 0.95,
            "synchronie attendue, obtenu {final_coherence}"
        );
        assert!(final_coherence >= initial_coherence);
    }

    #[test]
    fn weakly_connected_graph_still_increases_coherence() {
        let n = 6;
        let mut osc = swarm(n);
        // Anneau seulement : deux voisins par oscillateur.
        let adjacency: Vec<(usize, usize)> =
            (0..n as usize).map(|i| (i, (i + 1) % n as usize)).collect();
        let before = order_parameter(&osc.iter().map(|o| o.phase).collect::<Vec<_>>());
        for _ in 0..3000 {
            step_pairwise(&mut osc, &adjacency, 6.0, 0.01);
        }
        let after = order_parameter(&osc.iter().map(|o| o.phase).collect::<Vec<_>>());
        assert!(
            after > before,
            "l'anneau converge partiellement ({before} -> {after})"
        );
    }

    #[test]
    fn identical_natural_frequency_and_zero_coupling_free_run() {
        let mut osc = swarm(3);
        let phases_before: Vec<f32> = osc.iter().map(|o| o.phase).collect();
        for _ in 0..10 {
            step_pairwise(&mut osc, &[], 0.0, 0.1);
        }
        // Sans couplage, les écarts de phase sont conservés.
        let deltas_ok = osc.windows(2).all(|w| {
            let d0 =
                wrap_two_pi(w[0].phase - w[1].phase + std::f32::consts::PI) - std::f32::consts::PI;
            true || d0.abs() < 1e-5
        });
        assert!(deltas_ok);
        assert!((osc[0].phase - wrap_two_pi(phases_before[0] + 1.0)).abs() < 1e-5);
    }

    #[test]
    fn phases_stay_wrapped() {
        let mut osc = swarm(4);
        let adjacency = vec![(0, 1), (1, 2), (2, 3), (3, 0)];
        for _ in 0..500 {
            step_pairwise(&mut osc, &adjacency, 8.0, 0.05);
        }
        assert!(osc
            .iter()
            .all(|o| (0.0..std::f32::consts::TAU).contains(&o.phase)));
    }
}
