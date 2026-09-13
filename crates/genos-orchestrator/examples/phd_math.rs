use genos_biology::bioluminescence::FluorophoreColor;
use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_immune::{AntibodyDetector, Antigen};
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, SchedulingDecision, TokenBucketScheduler};
use std::f64::consts::PI;

type V3 = [f64; 3];

// --- 1. Oscillateur harmonique quantique (difference finies + Sturm/bissection)
// H = -1/2 d^2/dx^2 + 1/2 x^2 ; E_n = n + 1/2 (unites atomiques).

fn hamiltonian_x2(l: f64, n: usize) -> (impl Fn(usize) -> f64, f64) {
    let dx = 2.0 * l / (n as f64 + 1.0);
    let diag = move |i: usize| {
        let x = -l + (i + 1) as f64 * dx;
        1.0 / (dx * dx) + 0.5 * x * x
    };
    let off = -0.5 / (dx * dx);
    (diag, off)
}

fn schrodinger_eigenvalue(k: usize) -> f64 {
    let (l, n) = (8.0_f64, 400_usize);
    let (diag, off) = hamiltonian_x2(l, n);
    let count = |mu: f64| -> usize {
        let mut d = diag(0) - mu;
        let mut c = if d < 0.0 { 1 } else { 0 };
        for i in 1..n {
            let denom = if d.abs() < 1e-300 { 1e-300 } else { d };
            d = (diag(i) - mu) - off * off / denom;
            if d < 0.0 {
                c += 1;
            }
        }
        c
    };
    let (mut lo, mut hi) = (-1.0_f64, 60.0_f64);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if count(mid) > k {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    0.5 * (lo + hi)
}

// --- 2. Exposant de Lyapunov maximal de Lorenz (RK4 + Benettin)

fn lorenz(s: V3) -> V3 {
    let (x, y, z) = (s[0], s[1], s[2]);
    [10.0 * (y - x), x * (28.0 - z) - y, x * y - (8.0 / 3.0) * z]
}

fn jacobian(s: V3) -> [[f64; 3]; 3] {
    let (x, y, z) = (s[0], s[1], s[2]);
    [
        [-10.0, 10.0, 0.0],
        [28.0 - z, -1.0, -x],
        [y, x, -8.0 / 3.0],
    ]
}

fn add(a: V3, b: V3) -> V3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

fn scale(a: V3, k: f64) -> V3 {
    [a[0] * k, a[1] * k, a[2] * k]
}

fn jv(m: [[f64; 3]; 3], v: V3) -> V3 {
    [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ]
}

fn rk4_state(s: V3, dt: f64) -> V3 {
    let k1 = lorenz(s);
    let k2 = lorenz(add(s, scale(k1, dt / 2.0)));
    let k3 = lorenz(add(s, scale(k2, dt / 2.0)));
    let k4 = lorenz(add(s, scale(k3, dt)));
    add(
        add(add(s, scale(k1, dt / 6.0)), scale(k2, dt / 3.0)),
        add(scale(k3, dt / 3.0), scale(k4, dt / 6.0)),
    )
}

fn rk4_tangent(s: V3, d: V3, dt: f64) -> (V3, V3) {
    let (k1, d1) = (lorenz(s), jv(jacobian(s), d));
    let s2 = add(s, scale(k1, dt / 2.0));
    let (k2, d2) = (lorenz(s2), jv(jacobian(s2), add(d, scale(d1, dt / 2.0))));
    let s3 = add(s, scale(k2, dt / 2.0));
    let (k3, d3) = (lorenz(s3), jv(jacobian(s3), add(d, scale(d2, dt / 2.0))));
    let s4 = add(s, scale(k3, dt));
    let (k4, d4) = (lorenz(s4), jv(jacobian(s4), add(d, scale(d3, dt))));
    let s_next = add(
        add(add(s, scale(k1, dt / 6.0)), scale(k2, dt / 3.0)),
        add(scale(k3, dt / 3.0), scale(k4, dt / 6.0)),
    );
    let d_next = add(
        d,
        add(
            add(scale(d1, dt / 6.0), scale(d2, dt / 3.0)),
            add(scale(d3, dt / 3.0), scale(d4, dt / 6.0)),
        ),
    );
    (s_next, d_next)
}

fn lorenz_lyapunov() -> f64 {
    let dt = 0.005_f64;
    let mut s = [1.0_f64, 1.0, 1.0];
    for _ in 0..2000 {
        s = rk4_state(s, dt);
    }
    let mut d = [1.0_f64, 0.0, 0.0];
    let mut sum = 0.0;
    let mut steps = 0usize;
    let norm = |v: V3| (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    for _ in 0..20000 {
        let (sn, dn) = rk4_tangent(s, d, dt);
        s = sn;
        let n = norm(dn);
        sum += n.ln();
        d = scale(dn, 1.0 / n);
        steps += 1;
    }
    sum / (steps as f64 * dt)
}

// --- 3. Solveur de Poisson spectral periodique (DFT naive)

type C = (f64, f64);

fn cadd(a: C, b: C) -> C {
    (a.0 + b.0, a.1 + b.1)
}

fn cmul(a: C, b: C) -> C {
    (a.0 * b.0 - a.1 * b.1, a.0 * b.1 + a.1 * b.0)
}

fn dft(f: &[f64]) -> Vec<C> {
    let n = f.len();
    (0..n)
        .map(|k| {
            let acc = (0..n).fold((0.0, 0.0), |acc, j| {
                let ang = -2.0 * PI * (j * k) as f64 / n as f64;
                cadd(acc, cmul((f[j], 0.0), (ang.cos(), ang.sin())))
            });
            (acc.0 / n as f64, acc.1 / n as f64)
        })
        .collect()
}

fn idft(fhat: &[C]) -> Vec<f64> {
    let n = fhat.len();
    (0..n)
        .map(|j| {
            (0..n)
                .fold((0.0, 0.0), |acc, k| {
                    let ang = 2.0 * PI * (j * k) as f64 / n as f64;
                    cadd(acc, cmul(fhat[k], (ang.cos(), ang.sin())))
                })
                .0
        })
        .collect()
}

fn spectral_poisson_error() -> f64 {
    let n = 64;
    let dx = 1.0 / n as f64;
    let f: Vec<f64> = (0..n)
        .map(|j| {
            let x = j as f64 * dx;
            (2.0 * PI * x).sin() + 0.5 * (6.0 * PI * x).sin()
        })
        .collect();
    let fhat = dft(&f);
    let mut uhat = vec![(0.0, 0.0); n];
    for (k, uh) in uhat.iter_mut().enumerate() {
        if k == 0 {
            continue;
        }
        let freq = if k <= n / 2 { k as f64 } else { k as f64 - n as f64 };
        let lam = (2.0 * PI * freq).powi(2);
        *uh = (fhat[k].0 / lam, fhat[k].1 / lam);
    }
    let u = idft(&uhat);
    (0..n)
        .map(|j| {
            let x = j as f64 * dx;
            let exact = (2.0 * PI * x).sin() / (2.0 * PI).powi(2)
                + 0.5 * (6.0 * PI * x).sin() / (6.0 * PI).powi(2);
            (u[j] - exact).abs()
        })
        .fold(0.0_f64, f64::max)
}

fn main() {
    println!("=== MISSION DOCTORAT : QHO, Lyapunov de Lorenz, Poisson spectral ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Physique_Quantique", "QHO"),
        ("Systemes_Dynamiques", "Lorenz"),
        ("Analyse_Spectrale", "DFT"),
        ("Verification", "Preuves"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let mut ids = vec![];
    for (t, name, role) in [
        ("Physique_Quantique", "Kwame", "Quantum"),
        ("Systemes_Dynamiques", "Tariq", "Chaos"),
        ("Analyse_Spectrale", "Ayo", "Spectral"),
        ("Verification", "Zola", "Verifier"),
    ] {
        ids.push(orch.add_worker(t, AgentCell::new(name, name, role)).unwrap());
    }
    println!("[1] 4 tissus / 4 workers ; delegations :");
    for ((t, task), id) in [
        ("Physique_Quantique", "spectre du QHO"),
        ("Systemes_Dynamiques", "lambda_max de Lorenz"),
        ("Analyse_Spectrale", "-u''=f spectral"),
    ]
    .into_iter()
    .zip([ids[0], ids[1], ids[2]])
    {
        orch.delegate_task(t, (id, task)).unwrap();
        println!("    {t} <- {task}");
    }

    let ok = orch.audit_collusion("Verification", ("Zola", 1500, true));
    println!("[2] Audit preuve lourde : {}", ok.is_ok());

    orch.immune_selection
        .detectors
        .push(AntibodyDetector::new("qn", "MALICIOUS_DT", 0.85));
    let known = orch.detect_immune_threat(&Antigen {
        id: "d1".into(),
        epitope: "MALICIOUS_DT".into(),
        danger_level: 0.95,
    });
    println!("[3] Immunite : reconnu={known}, memoire={}", orch.immune_selection.memory_pool.len());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Kwame", "Tariq", "Ayo", "Zola"] {
        sched.register_agent(id, 30.0, 100.0);
    }
    let _ = sched.penalize_waste("Zola", 1.0);
    let ayo_quota = match sched.schedule_step("Ayo", 20.0) {
        SchedulingDecision::Allowed { remaining_tokens, .. } => remaining_tokens,
        _ => 0.0,
    };
    println!("[4] Ayo quota, reste {ayo_quota:.1} ; Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    let idx = orch.sporulate_cell(ids[2], SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    println!("[5] Ayo sporule/germe, reattache={}", orch.delegate_task("Analyse_Spectrale", (revived.cell_id, "reprise")).is_ok());

    orch.trigger_endosymbiosis(ids[1], ids[0]).unwrap();
    orch.emit_bioluminescence(FluorophoreColor::Green, "Nucleus", ("MISSION_DOCTORAT", "bilan"));
    println!("[6] Endosymbiose Tariq<Kwame : organites={}\n", orch.active_cells.get(&ids[1]).unwrap().organelles.len());

    let e: Vec<f64> = (0..5).map(schrodinger_eigenvalue).collect();
    let lambda = lorenz_lyapunov();
    let perr = spectral_poisson_error();

    println!("--- RESULTATS ---");
    for (n, en) in e.iter().enumerate() {
        println!("E_{n} = {en:.6}   (exact {:.1}, ecart {:.2e})", n as f64 + 0.5, (en - (n as f64 + 0.5)).abs());
    }
    println!("lambda_max(Lorenz)        = {lambda:.6}   (reference ~0.9056)");
    println!("Erreur L-infini Poisson  = {perr:.3e}");

    for (n, en) in e.iter().enumerate() {
        assert!((en - (n as f64 + 0.5)).abs() < 5e-3, "E_{n} hors tolerance");
    }
    assert!((0.85..0.96).contains(&lambda), "lambda hors plage");
    assert!(perr < 1e-10, "Poisson spectral non converge");
    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));

    println!("\nMISSION DOCTORAT VALIDEE");
}
