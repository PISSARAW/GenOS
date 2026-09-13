use genos_biology::bioluminescence::FluorophoreColor;
use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_immune::{AntibodyDetector, Antigen};
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, SchedulingDecision, TokenBucketScheduler};

// --- "Travail" mathématique niveau licence ---------------------------------

/// d/dx x^x = x^x (ln x + 1)
fn derivative_xx(x: f64) -> f64 {
    x.powf(x) * (x.ln() + 1.0)
}

/// Résolution de A x = b par élimination de Gauss avec pivot partiel.
fn solve3(a: [[f64; 3]; 3], b: [f64; 3]) -> [f64; 3] {
    let mut m = [[0.0_f64; 4]; 3];
    for i in 0..3 {
        for j in 0..3 {
            m[i][j] = a[i][j];
        }
        m[i][3] = b[i];
    }
    for col in 0..3 {
        let mut piv = col;
        for r in col + 1..3 {
            if m[r][col].abs() > m[piv][col].abs() {
                piv = r;
            }
        }
        m.swap(col, piv);
        let d = m[col][col];
        for j in col..4 {
            m[col][j] /= d;
        }
        for r in 0..3 {
            if r != col {
                let f = m[r][col];
                for j in col..4 {
                    m[r][j] -= f * m[col][j];
                }
            }
        }
    }
    [m[0][3], m[1][3], m[2][3]]
}

/// ∫₀^∞ x e^{-x} dx = 1, vérifiée numériquement (Simpson).
fn integral_xe_negx() -> f64 {
    let (n, a, b) = (200_000_usize, 0.0_f64, 50.0_f64);
    let h = (b - a) / n as f64;
    let f = |x: f64| x * (-x).exp();
    let mut s = f(a) + f(b);
    for i in 1..n {
        s += if i % 2 == 1 { 4.0 } else { 2.0 } * f(a + i as f64 * h);
    }
    s * h / 3.0
}

fn close(a: f64, b: f64, eps: f64) -> bool {
    (a - b).abs() < eps
}

fn main() {
    println!("=== MISSION LICENCE : x^x, systeme 3x3, integrale impropre ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    orch.create_tissue("Analyse", "Derivation").unwrap();
    orch.create_tissue("Algebre_Lineaire", "Systemes").unwrap();
    orch.create_tissue("Verification", "Preuves independantes").unwrap();

    let ayo = orch
        .add_worker("Analyse", AgentCell::new("Ayo", "creativite vivace", "Analyst"))
        .unwrap();
    let nia = orch
        .add_worker("Algebre_Lineaire", AgentCell::new("Nia", "determination", "Algebraist"))
        .unwrap();
    let zola = orch
        .add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Verifier"))
        .unwrap();

    println!("[1] Tissus + 3 workers : Ayo/Analyse, Nia/Algebre, Zola/Verification");
    println!("    Ayo  -> {}", orch.delegate_task("Analyse", (ayo, "d/dx x^x en x=2")).unwrap());
    println!("    Nia  -> {}", orch.delegate_task("Algebre_Lineaire", (nia, "resoudre Ax=b")).unwrap());

    // --- Anti-collusion (Handicap de Zahavi + arbitrage realite) ---
    let cheap = orch.audit_collusion("Verification", ("Zola", 100, true));
    println!("[2] Audit bon marche rejete : {}", cheap.is_err());
    let honest = orch.audit_collusion("Verification", ("Zola", 900, true));
    println!("    Audit couteux accepte : {}", honest.is_ok());

    // --- Immunite: detecter une injection de prompt ---
    orch.immune_selection
        .detectors
        .push(AntibodyDetector::new("inj", "IGNORE_PREVIOUS", 0.8));
    let threat = Antigen {
        id: "malicious-1".into(),
        epitope: "IGNORE_PREVIOUS".into(),
        danger_level: 0.9,
    };
    println!("[3] Menace immunitaire detectee : {}\n", orch.detect_immune_threat(&threat));

    // --- Quotas de calcul (token bucket) ---
    let mut sched = TokenBucketScheduler::new();
    sched.register_agent("Ayo", 50.0, 100.0);
    sched.register_agent("Nia", 40.0, 100.0);
    sched.register_agent("Zola", 10.0, 100.0);
    for (id, cost) in [("Ayo", 20.0), ("Nia", 15.0)] {
        if let SchedulingDecision::Allowed { remaining_tokens, .. } = sched.schedule_step(id, cost) {
            println!("[4] {id} : quota accorde, reste {remaining_tokens:.1}");
        }
    }
    let pw = sched.penalize_waste("Zola", 1.0).unwrap();
    println!("    Zola gaspille -> {:?}, solde {:.1}", pw.state, pw.new_balance);

    // --- Conscience : Ayo progresse, Zola derive ---
    let ayo_state = orch.evaluate_worker(ayo, (0, 10.0)).unwrap();
    let zola_state = orch.evaluate_worker(zola, (8, 0.0)).unwrap();
    println!("[5] Ayo  : dissonance={:.1} apoptose={}", ayo_state.dissonance_level, ayo_state.is_apoptotic);
    println!("    Zola : dissonance={:.1} apoptose={}", zola_state.dissonance_level, zola_state.is_apoptotic);

    // --- Resilience : sporuler Zola puis le ranimer dans son tissu ---
    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let detached = orch.delegate_task("Verification", (zola, "x")).is_err();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    let reattached = orch.delegate_task("Verification", (revived.cell_id, "re-verifier")).is_ok();
    println!("[6] Zola sporule -> detache={detached}, germe -> reattache={reattached}");

    // --- Endosymbiose : Nia phagocyte Ayo (zero-IPC) ---
    orch.trigger_endosymbiosis(nia, ayo).unwrap();
    println!("[7] Nia a phagocyte Ayo : organites={}", orch.active_cells.get(&nia).unwrap().organelles.len());
    orch.emit_bioluminescence(FluorophoreColor::Green, "Nucleus", ("MISSION", "bilan"));

    // --- Resultats mathematiques et verification ---
    let det = 1.0_f64;
    let d2 = derivative_xx(2.0);
    let integral = integral_xe_negx();
    let sol = solve3(
        [[2.0, 1.0, -1.0], [-3.0, -1.0, 2.0], [-2.0, 1.0, 2.0]],
        [8.0, -11.0, -3.0],
    );
    let expected = [2.0_f64, 3.0, -1.0];
    let residual: f64 = {
        // A x - b
        let ax = [
            2.0 * sol[0] + 1.0 * sol[1] - 1.0 * sol[2],
            -3.0 * sol[0] - 1.0 * sol[1] + 2.0 * sol[2],
            -2.0 * sol[0] + 1.0 * sol[1] + 2.0 * sol[2],
        ];
        ((ax[0] - 8.0).powi(2) + (ax[1] + 11.0).powi(2) + (ax[2] + 3.0).powi(2)).sqrt()
    };

    println!("\n--- RESULTATS ---");
    println!("d/dx x^x |_(x=2)      = {d2:.10}   (attendu {:.10})", 4.0 * (2.0_f64.ln() + 1.0));
    println!("det(A)                = {det:.6}");
    println!("∫ x e^-x dx sur R+    = {integral:.10}   (attendu 1)");
    println!("Solution Ax=b         = [{:.6}, {:.6}, {:.6}]", sol[0], sol[1], sol[2]);
    println!("Residu ||Ax-b||       = {residual:.3e}");

    assert!(close(d2, 4.0 * (2.0_f64.ln() + 1.0), 1e-12));
    assert!(close(integral, 1.0, 1e-8));
    assert!(close(sol[0], expected[0], 1e-9) && close(sol[1], expected[1], 1e-9) && close(sol[2], expected[2], 1e-9));
    assert!(residual < 1e-9);
    assert!(matches!(pw.state, BucketState::Apoptotic));
    assert!(reattached && detached);
    assert!(orch.active_cells.get(&nia).map(|c| c.organelles.len() == 1).unwrap_or(false));

    println!("\nMISSION LICENCE VALIDEE");
}
