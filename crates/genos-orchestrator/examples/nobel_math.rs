use genos_biology::bioluminescence::FluorophoreColor;
use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_immune::{AntibodyDetector, Antigen};
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, TokenBucketScheduler};
use std::f64::consts::PI;

// --- Hypotheses de Riemann : zeros non triviaux de zeta sur la droite crit.
// NB: il n'existe pas de prix Nobel de mathematiques ; l'equivalent est la
// medaille Fields / le prix Abel, et ce probleme est un "probleme du millenaire".

type C = (f64, f64);

fn cadd(a: C, b: C) -> C {
    (a.0 + b.0, a.1 + b.1)
}

fn cmul(a: C, b: C) -> C {
    (a.0 * b.0 - a.1 * b.1, a.0 * b.1 + a.1 * b.0)
}

fn cdiv(a: C, b: C) -> C {
    let d = b.0 * b.0 + b.1 * b.1;
    ((a.0 * b.0 + a.1 * b.1) / d, (a.1 * b.0 - a.0 * b.1) / d)
}

fn cscale(a: C, k: f64) -> C {
    (a.0 * k, a.1 * k)
}

/// n^{-s} pour s = 1/2 + i t.
fn npow_neg_s(n: f64, t: f64) -> C {
    let ln = n.ln();
    let mag = n.powf(-0.5);
    (mag * (t * ln).cos(), -mag * (t * ln).sin())
}

/// zeta(1/2 + i t) par sommation d'Euler-Maclaurin (N termes + correction).
fn zeta_half(t: f64) -> C {
    let s = (0.5_f64, t);
    let big_n = 30.0_f64;
    let mut sum = (0.0, 0.0);
    for n in 1..big_n as usize {
        sum = cadd(sum, npow_neg_s(n as f64, t));
    }
    let n_neg_s = npow_neg_s(big_n, t);
    // N^{1-s} / (s-1)  +  N^{-s}/2
    sum = cadd(sum, cdiv(cscale(n_neg_s, big_n), (s.0 - 1.0, s.1)));
    sum = cadd(sum, cscale(n_neg_s, 0.5));
    // Série correctrice d'Euler-Maclaurin
    let bern = [
        1.0 / 6.0,
        -1.0 / 30.0,
        1.0 / 42.0,
        -1.0 / 30.0,
        5.0 / 66.0,
        -691.0 / 2730.0,
        7.0 / 6.0,
        -3617.0 / 510.0,
        43867.0 / 798.0,
        -174611.0 / 330.0,
    ];
    let mut fact2k = 2.0_f64; // (2k)!
    let mut rising = s; // (s)_{2k-1}
    for k in 1..=bern.len() {
        let coeff = bern[k - 1] / fact2k;
        let neg_pow = cscale(n_neg_s, big_n.powi(1 - 2 * k as i32));
        sum = cadd(sum, cscale(cmul((coeff, 0.0), cmul(rising, neg_pow)), 1.0));
        let kf = 2.0 * k as f64;
        rising = cmul(cmul(rising, (s.0 + kf - 1.0, s.1)), (s.0 + kf, s.1));
        fact2k *= (kf + 1.0) * (kf + 2.0);
    }
    sum
}

/// Phase de Riemann-Siegel theta(t).
fn theta(t: f64) -> f64 {
    t / 2.0 * (t / (2.0 * PI)).ln() - t / 2.0 - PI / 8.0
        + 1.0 / (48.0 * t)
        + 7.0 / (5760.0 * t.powi(3))
}

/// Fonction Z de Riemann-Siegel : reelle sur la droite critique.
fn z_function(t: f64) -> f64 {
    let th = theta(t);
    cmul((th.cos(), th.sin()), zeta_half(t)).0
}

fn refine_zero(mut a: f64, mut b: f64) -> f64 {
    let mut fa = z_function(a);
    for _ in 0..200 {
        let mid = 0.5 * (a + b);
        let fm = z_function(mid);
        if fa * fm <= 0.0 {
            b = mid;
        } else {
            a = mid;
            fa = fm;
        }
    }
    0.5 * (a + b)
}

fn first_zero_after(start: f64) -> f64 {
    let mut t = start;
    let mut prev = z_function(t);
    loop {
        let next = t + 0.01;
        let cur = z_function(next);
        if prev * cur < 0.0 {
            return refine_zero(t, next);
        }
        t = next;
        prev = cur;
    }
}

fn main() {
    println!("=== MISSION 'MILLENAIRE' : zeros de zeta sur la droite critique ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Theorie_Nombres", "Zeta"),
        ("Analyse_Complexe", "Euler-Maclaurin"),
        ("Verification", "Preuves"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let kwame = orch
        .add_worker("Theorie_Nombres", AgentCell::new("Kwame", "planificateur", "NumberTheory"))
        .unwrap();
    let tariq = orch
        .add_worker("Analyse_Complexe", AgentCell::new("Tariq", "eclaireur", "ComplexAnalysis"))
        .unwrap();
    let zola = orch
        .add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Verifier"))
        .unwrap();
    orch.delegate_task("Theorie_Nombres", (kwame, "localiser t_1 et t_2")).unwrap();
    orch.delegate_task("Analyse_Complexe", (tariq, "zeta(1/2+it)")).unwrap();
    println!("[1] Delegations : t_1,t_2 <- Theorie_Nombres ; zeta <- Analyse_Complexe");

    orch.immune_selection
        .detectors
        .push(AntibodyDetector::new("ns", "INVALID_RESIDUE", 0.85));
    let known = orch.detect_immune_threat(&Antigen {
        id: "n1".into(),
        epitope: "INVALID_RESIDUE".into(),
        danger_level: 0.95,
    });
    let ok = orch.audit_collusion("Verification", ("Zola", 2000, true));
    println!("[2] Immunite={known} ; audit preuve lourde={}", ok.is_ok());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Kwame", "Tariq", "Zola"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let r = sched.reward_proof("Tariq", 0.97).unwrap();
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Tariq +{:.1} tokens (cap {}) ; Zola={:?}", r.added_tokens, r.capacity, sched.buckets.get("Zola").unwrap().state);

    orch.trigger_endosymbiosis(kwame, tariq).unwrap();
    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    println!("[4] Kwame<Tariq organites={} ; Zola reattache={}", orch.active_cells.get(&kwame).unwrap().organelles.len(), orch.delegate_task("Verification", (revived.cell_id, "audit")).is_ok());
    orch.emit_bioluminescence(FluorophoreColor::Green, "Nucleus", ("MILLENNIUM", "bilan"));

    let t1 = first_zero_after(13.0);
    let t2 = first_zero_after(t1 + 1.0);
    let ref1 = 14.134_725_141_734_693_f64;
    let ref2 = 21.022_039_638_064_f64;

    println!("\n--- RESULTATS ---");
    println!("t_1 = {t1:.9}   (reference {ref1:.9}, ecart {:.2e})", (t1 - ref1).abs());
    println!("t_2 = {t2:.9}   (reference {ref2:.9}, ecart {:.2e})", (t2 - ref2).abs());
    println!("Z(t_1)={:.3e}  Z(t_2)={:.3e}", z_function(t1), z_function(t2));

    assert!((t1 - ref1).abs() < 1e-6, "t_1 hors tolerance");
    assert!((t2 - ref2).abs() < 1e-6, "t_2 hors tolerance");
    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));

    println!("\nMISSION 'MILLENAIRE' VALIDEE");
}
