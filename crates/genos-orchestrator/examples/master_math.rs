#![allow(clippy::needless_range_loop)]

use genos_biology::bioluminescence::FluorophoreColor;
use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_immune::{AntibodyDetector, Antigen};
use genos_orchestrator::{
    BiomimeticOrchestrator, BucketState, SchedulingDecision, TokenBucketScheduler,
};

// --- Analyse numerique niveau master ---------------------------------------

/// pi par la moyenne arithmetico-geometrique de Gauss (convergence quadratique).
fn agm_pi() -> f64 {
    let mut a = 1.0_f64;
    let mut b = 1.0 / 2.0_f64.sqrt();
    let mut t = 0.25_f64;
    let mut p = 1.0_f64;
    for _ in 0..6 {
        let a_next = 0.5 * (a + b);
        b = (a * b).sqrt();
        t -= p * (a - a_next).powi(2);
        a = a_next;
        p *= 2.0;
    }
    (a + b).powi(2) / (4.0 * t)
}

/// Algorithme de Jacobi : spectre et vecteurs propres d'une matrice symetrique.
fn jacobi(mut a: [[f64; 3]; 3]) -> ([f64; 3], [[f64; 3]; 3]) {
    let mut v = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    for _ in 0..100 {
        let (mut p, mut q, mut max) = (0usize, 1usize, a[0][1].abs());
        for i in 0..3 {
            for j in i + 1..3 {
                if a[i][j].abs() > max {
                    max = a[i][j].abs();
                    p = i;
                    q = j;
                }
            }
        }
        if max < 1e-15 {
            break;
        }
        let theta = 0.5 * (2.0 * a[p][q]).atan2(a[q][q] - a[p][p]);
        let (c, s) = (theta.cos(), theta.sin());
        for i in 0..3 {
            let (aip, aiq) = (a[i][p], a[i][q]);
            a[i][p] = c * aip - s * aiq;
            a[i][q] = s * aip + c * aiq;
        }
        for i in 0..3 {
            let (api, aqi) = (a[p][i], a[q][i]);
            a[p][i] = c * api - s * aqi;
            a[q][i] = s * api + c * aqi;
        }
        for i in 0..3 {
            let (vip, viq) = (v[i][p], v[i][q]);
            v[i][p] = c * vip - s * viq;
            v[i][q] = s * vip + c * viq;
        }
    }
    ([a[0][0], a[1][1], a[2][2]], v)
}

/// Solveur tridiagonal de Thomas pour une matrice a diagonale constante.
fn thomas(diag: f64, off: f64, rhs: &[f64]) -> Vec<f64> {
    let m = rhs.len();
    let mut c = vec![0.0; m];
    let mut d = vec![0.0; m];
    c[0] = off / diag;
    d[0] = rhs[0] / diag;
    for i in 1..m {
        let denom = diag - off * c[i - 1];
        c[i] = off / denom;
        d[i] = (rhs[i] - off * d[i - 1]) / denom;
    }
    let mut x = vec![0.0; m];
    x[m - 1] = d[m - 1];
    for i in (0..m - 1).rev() {
        x[i] = d[i] - c[i] * x[i + 1];
    }
    x
}

/// Erreur L-infini de Crank-Nicolson sur u_t = u_xx, u(x,0)=sin(pi x), u=0 aux bords.
fn heat_error(t_end: f64) -> f64 {
    let (n, r) = (100_usize, 0.5_f64);
    let dx = 1.0 / n as f64;
    let dt = r * dx * dx;
    let steps = (t_end / dt).round() as usize;
    let m = n - 1;
    let mut u: Vec<f64> = (0..m)
        .map(|i| (std::f64::consts::PI * (i + 1) as f64 * dx).sin())
        .collect();
    for _ in 0..steps {
        let mut rhs = vec![0.0; m];
        for i in 0..m {
            let left = if i > 0 { (r / 2.0) * u[i - 1] } else { 0.0 };
            let right = if i + 1 < m { (r / 2.0) * u[i + 1] } else { 0.0 };
            rhs[i] = left + (1.0 - r) * u[i] + right;
        }
        u = thomas(1.0 + r, -r / 2.0, &rhs);
    }
    (0..m)
        .map(|i| {
            let x = (i + 1) as f64 * dx;
            let exact = (-std::f64::consts::PI.powi(2) * t_end).exp()
                * (std::f64::consts::PI * x).sin();
            (u[i] - exact).abs()
        })
        .fold(0.0_f64, f64::max)
}

fn main() {
    println!("=== MISSION MASTER : AGM, spectre symetrique, EDP de la chaleur ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Analyse_Numerique", "AGM / quadrature"),
        ("Algebre_Numerique", "Spectre"),
        ("EDP", "Crank-Nicolson"),
        ("Verification", "Preuves"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let tariq = orch
        .add_worker("Analyse_Numerique", AgentCell::new("Tariq", "eclaireur", "Analyst"))
        .unwrap();
    let nia = orch
        .add_worker("Algebre_Numerique", AgentCell::new("Nia", "determination", "Spectra"))
        .unwrap();
    let kwame = orch
        .add_worker("EDP", AgentCell::new("Kwame", "planificateur", "PDE"))
        .unwrap();
    let zola = orch
        .add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Verifier"))
        .unwrap();
    println!("[1] 4 tissus, 4 workers ; delegations :");
    for (t, id, task) in [
        ("Analyse_Numerique", tariq, "pi par AGM (24 chiffres)"),
        ("Algebre_Numerique", nia, "spectre de A"),
        ("EDP", kwame, "u_t=u_xx par Crank-Nicolson"),
    ] {
        orch.delegate_task(t, (id, task)).unwrap();
        println!("    {t} <- {task}");
    }

    // Anti-collusion : signal couteux + realite
    let ok = orch.audit_collusion("Verification", ("Zola", 1200, true));
    println!("[2] Audit verification (1200 tokens) : {}", ok.is_ok());

    // Immunite adaptative avec memoire
    orch.immune_selection
        .detectors
        .push(AntibodyDetector::new("pde", "POISON_DT", 0.8));
    let known = orch.detect_immune_threat(&Antigen {
        id: "t1".into(),
        epitope: "POISON_DT".into(),
        danger_level: 0.9,
    });
    println!("[3] Antigene connu reconnu : {known}, memoire={}", orch.immune_selection.memory_pool.len());

    // Conscience avancee : sante, derive, repetition
    {
        let cell = orch.active_cells.get_mut(&kwame).unwrap();
        orch.conscience.evaluate_branch_extended(&mut cell.conscience, 1, 5.0, 0.2, 0.1, 0.4);
    }
    let kw_state = orch.evaluate_worker(kwame, (0, 5.0)).unwrap();
    println!("[4] Kwame : dissonance={:.1} apoptose={}", kw_state.dissonance_level, kw_state.is_apoptotic);

    // Quotas : throttle puis reward nul
    let mut sched = TokenBucketScheduler::new();
    for id in ["Tariq", "Nia", "Kwame", "Zola"] {
        sched.register_agent(id, 30.0, 100.0);
    }
    let mut kwame_decision = SchedulingDecision::Suspended { sleep_ms: 0, reason: String::new() };
    for _ in 0..4 {
        kwame_decision = sched.schedule_step("Kwame", 50.0);
    }
    let revived_quota = sched.reward_proof("Kwame", 0.0);
    println!("[5] Kwame quota 30<50 -> {kwame_decision:?}; reward nul accepte={}", revived_quota.is_ok());
    let _ = sched.penalize_waste("Zola", 1.0);

    // Resilience
    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    println!("[6] Zola sporule/germe, reattache={}", orch.delegate_task("Verification", (revived.cell_id, "audit")).is_ok());

    // Endosymbiose : Nia integre Tariq
    orch.trigger_endosymbiosis(nia, tariq).unwrap();
    println!("[7] Nia<Tariq : organites={}", orch.active_cells.get(&nia).unwrap().organelles.len());
    orch.emit_bioluminescence(FluorophoreColor::Green, "Nucleus", ("MISSION_MASTER", "bilan"));

    // --- Resultats mathematiques ---
    let pi = agm_pi();
    let a = [[4.0, 1.0, 0.0], [1.0, 3.0, 1.0], [0.0, 1.0, 2.0]];
    let (mut ev, vecs) = jacobi(a);
    let trace: f64 = a[0][0] + a[1][1] + a[2][2];
    let det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
        - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
        + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    let ev_sum: f64 = ev.iter().sum();
    let ev_prod: f64 = ev.iter().product();
    let mut residual = 0.0_f64;
    for k in 0..3 {
        let lam = ev[k];
        let v = [vecs[0][k], vecs[1][k], vecs[2][k]];
        let av = [
            a[0][0] * v[0] + a[0][1] * v[1] + a[0][2] * v[2],
            a[1][0] * v[0] + a[1][1] * v[1] + a[1][2] * v[2],
            a[2][0] * v[0] + a[2][1] * v[1] + a[2][2] * v[2],
        ];
        residual = residual.max(
            ((av[0] - lam * v[0]).powi(2) + (av[1] - lam * v[1]).powi(2) + (av[2] - lam * v[2]).powi(2)).sqrt(),
        );
    }
    ev.sort_by(|x, y| x.partial_cmp(y).unwrap());
    let herror = heat_error(0.1);

    println!("\n--- RESULTATS ---");
    println!("pi (AGM)                 = {pi:.15}   (ecart {:.2e})", (pi - std::f64::consts::PI).abs());
    println!("Spectre de A             = [{:.6}, {:.6}, {:.6}]", ev[0], ev[1], ev[2]);
    println!("trace(A)={trace}  somme(lambda)={ev_sum:.6}");
    println!("det(A)={det}      produit(lambda)={ev_prod:.6}");
    println!("Residu spectre max       = {residual:.3e}");
    println!("Erreur L-infini chaleur  = {herror:.3e}");

    assert!((pi - std::f64::consts::PI).abs() < 1e-14);
    assert!((ev_sum - trace).abs() < 1e-9 && (ev_prod - det).abs() < 1e-9);
    assert!(residual < 1e-9);
    assert!(herror < 1e-3);
    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&nia).map(|c| c.organelles.len() == 1).unwrap_or(false));

    println!("\nMISSION MASTER VALIDEE");
}
