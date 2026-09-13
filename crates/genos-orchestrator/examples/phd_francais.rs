use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, SchedulingDecision, TokenBucketScheduler};
use std::collections::HashMap;

// --- Doctorat de francais : stylometrie computationnelle --------------------

const MOTS_OUTILS: [&str; 12] = [
    "de", "la", "le", "et", "les", "des", "un", "que", "je", "on", "pas", "ne",
];

fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphabetic())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase())
        .collect()
}

/// Frequences relatives des mots-outils d'un texte.
fn profil(text: &str) -> Vec<f64> {
    let toks = tokenize(text);
    let total = toks.len().max(1) as f64;
    MOTS_OUTILS
        .iter()
        .map(|m| toks.iter().filter(|t| t == m).count() as f64 / total)
        .collect()
}

/// Profil moyen et ecart-type par mot-outil sur un ensemble d'echantillons.
fn entrainer(echantillons: &[&str]) -> (Vec<f64>, Vec<f64>) {
    let profs: Vec<Vec<f64>> = echantillons.iter().map(|t| profil(t)).collect();
    let n = profs.len() as f64;
    let moyennes: Vec<f64> = (0..MOTS_OUTILS.len())
        .map(|j| profs.iter().map(|p| p[j]).sum::<f64>() / n)
        .collect();
    let ecarts: Vec<f64> = (0..MOTS_OUTILS.len())
        .map(|j| {
            let var = profs.iter().map(|p| (p[j] - moyennes[j]).powi(2)).sum::<f64>() / n;
            var.sqrt().max(0.0005) // plancher pour eviter la division par ~0
        })
        .collect();
    (moyennes, ecarts)
}

/// Distance Delta de Burrows (moyenne des z-scores absolus).
fn delta(profil_test: &[f64], moyennes: &[f64], ecarts: &[f64]) -> f64 {
    let n = profil_test.len() as f64;
    profil_test
        .iter()
        .zip(moyennes.iter().zip(ecarts.iter()))
        .map(|(t, (m, e))| ((t - m) / e).abs())
        .sum::<f64>()
        / n
}

/// Entropie de Shannon (bits) de la distribution des mots.
fn entropie(text: &str) -> f64 {
    let toks = tokenize(text);
    let total = toks.len() as f64;
    let mut freq: HashMap<&str, usize> = HashMap::new();
    for t in &toks {
        *freq.entry(t.as_str()).or_insert(0) += 1;
    }
    -freq
        .values()
        .map(|c| {
            let p = *c as f64 / total;
            p * p.log2()
        })
        .sum::<f64>()
}

/// Richesse lexicale (ratio types/tokens).
fn ttr(text: &str) -> f64 {
    let toks = tokenize(text);
    let types: std::collections::HashSet<&String> = toks.iter().collect();
    types.len() as f64 / toks.len().max(1) as f64
}

/// Pente de la loi de Zipf : regression lineaire de log(freq) sur log(rang).
fn zipf_slope(corpus: &str) -> f64 {
    let toks = tokenize(corpus);
    let mut freq: HashMap<&str, usize> = HashMap::new();
    for t in &toks {
        *freq.entry(t.as_str()).or_insert(0) += 1;
    }
    let mut counts: Vec<usize> = freq.values().copied().collect();
    counts.sort_unstable_by(|a, b| b.cmp(a));
    // On ignore le mot le plus frequent, souvent hors loi de puissance.
    let xs: Vec<f64> = (2..=counts.len()).map(|r| (r as f64).ln()).collect();
    let ys: Vec<f64> = counts.iter().skip(1).map(|c| (*c as f64).ln()).collect();
    let n = xs.len() as f64;
    let mx = xs.iter().sum::<f64>() / n;
    let my = ys.iter().sum::<f64>() / n;
    let cov = xs.iter().zip(&ys).map(|(x, y)| (x - mx) * (y - my)).sum::<f64>();
    let var = xs.iter().map(|x| (x - mx).powi(2)).sum::<f64>();
    cov / var
}

fn main() {
    println!("=== MISSION DOCTORAT DE FRANCAIS : stylometrie de Burrows' Delta ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Corpus", "Attribution"),
        ("Statistiques", "Entropie"),
        ("Lexicometrie", "Zipf"),
        ("Verification", "Preuves"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let kwame = orch
        .add_worker("Corpus", AgentCell::new("Kwame", "planificateur", "Corpus"))
        .unwrap();
    let nia = orch
        .add_worker("Statistiques", AgentCell::new("Nia", "determination", "Statisticienne"))
        .unwrap();
    let tariq = orch
        .add_worker("Lexicometrie", AgentCell::new("Tariq", "eclaireur", "Lexicometre"))
        .unwrap();
    let zola = orch
        .add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Verificateur"))
        .unwrap();
    orch.delegate_task("Corpus", (kwame, "Delta de Burrows")).unwrap();
    orch.delegate_task("Statistiques", (nia, "entropie et TTR")).unwrap();
    orch.delegate_task("Lexicometrie", (tariq, "pente de Zipf")).unwrap();
    println!("[1] Tissus Corpus/Statistiques/Lexicometrie/Verification ; delegations posees");

    let ok = orch.audit_collusion("Verification", ("Zola", 1400, true));
    println!("[2] Audit preuve lourde={}", ok.is_ok());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Kwame", "Nia", "Tariq", "Zola"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let _ = sched.reward_proof("Nia", 0.96);
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Nia quota boost ; Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    orch.trigger_endosymbiosis(kwame, nia).unwrap();
    println!("[4] Zola reattache={} ; Kwame<Nia organites={}\n", orch.delegate_task("Verification", (revived.cell_id, "audit")).is_ok(), orch.active_cells.get(&kwame).unwrap().organelles.len());

    // --- Echantillons (style A : hypotaxe proustienne ; style B : oral celineien)
    let auteur_a = [
        "Je pensais que la memoire de ces jours anciens que je croyais perdus etait restee dans les objets que nous avions touches.",
        "Il me semblait que le temps que je cherchais a retrouver etait de ces instants que la vie nous accorde rarement.",
        "Je ne savais pas que cette odeur de la chambre que j'aimais etait celle des souvenirs que je voulais garder.",
    ];
    let auteur_b = [
        "Et on avance et on s'en fout et les gens ils disent rien et on ne regrette pas.",
        "Il etait pas content et on lui a pas demande et il a rien dit et on est partis.",
        "Et la vie elle passe et on la voit pas et les jours ils comptent pas et on attend.",
    ];
    let test_a = "Je me disais que les jours que nous avions vecus etaient ceux que je voulais et que rien ne les effacerait.";
    let test_b = "Et il etait pas la et on a rien dit et les autres ils ont pas repondu et on est restes.";

    let (ma, sa) = entrainer(&auteur_a);
    let (mb, sb) = entrainer(&auteur_b);
    let da = delta(&profil(test_a), &ma, &sa);
    let db = delta(&profil(test_a), &mb, &sb);
    let da2 = delta(&profil(test_b), &ma, &sa);
    let db2 = delta(&profil(test_b), &mb, &sb);
    println!("--- BURROWS' DELTA ---");
    println!("test_a : Delta(A)={da:.3} Delta(B)={db:.3} -> {}", if da < db { "auteur A" } else { "auteur B" });
    println!("test_b : Delta(A)={da2:.3} Delta(B)={db2:.3} -> {}", if da2 < db2 { "auteur A" } else { "auteur B" });

    // --- Entropie, TTR, Zipf ---
    let corpus = format!(
        "{} {} {} {} {} {}",
        auteur_a[0], auteur_a[1], auteur_a[2], auteur_b[0], auteur_b[1], auteur_b[2]
    );
    let h = entropie(&corpus);
    let r = ttr(&corpus);
    let pente = zipf_slope(&corpus);
    println!("--- LEXICOMETRIE ---");
    println!("entropie de Shannon = {h:.3} bits");
    println!("richesse (TTR)      = {r:.3}");
    println!("pente de Zipf       = {pente:.3}");

    assert!(da < db, "test_a doit etre attribue a A");
    assert!(db2 < da2, "test_b doit etre attribue a B");
    assert!(h > 4.0, "entropie lexicale trop faible");
    assert!((0.3..0.95).contains(&r), "TTR hors plage");
    assert!(pente < -0.5 && pente > -2.0, "pente de Zipf aberrante");
    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&kwame).map(|c| c.organelles.len() == 1).unwrap_or(false));

    println!("\nMISSION DOCTORAT DE FRANCAIS VALIDEE");
}
