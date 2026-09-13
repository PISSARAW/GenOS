use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, SchedulingDecision, TokenBucketScheduler};

// --- Licence de francais : versification, morphologie, orthographe ---------

fn is_vowel(c: char) -> bool {
    matches!(
        c,
        'a' | 'e' | 'i' | 'o' | 'u' | 'y' | 'à' | 'â' | 'ä' | 'é' | 'è' | 'ê' | 'ë'
            | 'î' | 'ï' | 'ô' | 'ö' | 'ù' | 'û' | 'ü' | 'œ' | 'æ'
    )
}

fn lex(line: &str) -> Vec<String> {
    line.split(|c: char| !c.is_alphabetic())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase())
        .collect()
}

/// Compte les groupes vocaliques d'un mot (approximation : chaque groupe = 1).
fn vowel_groups(word: &str) -> usize {
    let mut count = 0;
    let mut prev = false;
    for c in word.chars() {
        let v = is_vowel(c);
        if v && !prev {
            count += 1;
        }
        prev = v;
    }
    count
}

/// Syllabes d'un vers, avec elision du e muet final (fin de vers ou voyelle suivante).
fn line_syllables(line: &str) -> (usize, Vec<usize>) {
    let ws = lex(line);
    let mut per_word = Vec::new();
    for (i, w) in ws.iter().enumerate() {
        let mut g = vowel_groups(w);
        if w.ends_with('e') {
            let last = i + 1 == ws.len();
            let next_vowel = ws
                .get(i + 1)
                .and_then(|n| n.chars().next())
                .map(is_vowel)
                .unwrap_or(false);
            if last || next_vowel {
                g = g.saturating_sub(1);
            }
        }
        per_word.push(g);
    }
    (per_word.iter().sum(), per_word)
}

/// Position de la cesure apres 6 syllabes (hemistiche), si elle tombe en fin de mot.
fn cesura_at_six(per_word: &[usize]) -> Option<usize> {
    let mut cum = 0;
    for (i, g) in per_word.iter().enumerate() {
        cum += g;
        if cum == 6 {
            return Some(i);
        }
        if cum > 6 {
            break;
        }
    }
    None
}

/// Subjonctif imparfait du verbe etre.
fn subj_imparfait_etre() -> [&'static str; 6] {
    [
        "que je fusse",
        "que tu fusses",
        "qu'il fût",
        "que nous fussions",
        "que vous fussiez",
        "qu'ils fussent",
    ]
}

/// Passe simple du verbe venir.
fn passe_simple_venir() -> [&'static str; 6] {
    [
        "je vins",
        "tu vins",
        "il vint",
        "nous vînmes",
        "vous vîntes",
        "ils vinrent",
    ]
}

/// Accord du participe passe : base + marque de genre/nombre.
fn accord_pp(base: &str, genre: char, nombre: char) -> String {
    let mut s = base.to_string();
    if genre == 'f' {
        s.push('e');
    }
    if nombre == 'p' {
        s.push('s');
    }
    s
}

fn main() {
    println!("=== MISSION LICENCE DE FRANCAIS : versification, morphologie, orthographe ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Versification", "Metrique"),
        ("Morphosyntaxe", "Conjugaison"),
        ("Orthographe", "Accords"),
        ("Verification", "Preuves"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let chidi = orch
        .add_worker("Versification", AgentCell::new("Chidi", "esprit logique", "Metricien"))
        .unwrap();
    let nia = orch
        .add_worker("Morphosyntaxe", AgentCell::new("Nia", "determination", "Grammairienne"))
        .unwrap();
    let zola = orch
        .add_worker("Orthographe", AgentCell::new("Zola", "pacificateur", "Correctrice"))
        .unwrap();
    let _ayo = orch
        .add_worker("Verification", AgentCell::new("Ayo", "creativite", "Verificateur"))
        .unwrap();
    println!("[1] 4 tissus / 4 workers ; delegations :");
    for (t, id, task) in [
        ("Versification", chidi, "alexandrins : 12 syllabes + cesure"),
        ("Morphosyntaxe", nia, "subjonctif imparfait / passe simple"),
        ("Orthographe", zola, "accord du participe passe"),
    ] {
        orch.delegate_task(t, (id, task)).unwrap();
        println!("    {t} <- {task}");
    }

    // Anti-collusion : la relecture doit couter cher (signal de Zahavi)
    let cheap = orch.audit_collusion("Verification", ("Ayo", 80, true));
    let serious = orch.audit_collusion("Verification", ("Ayo", 1000, true));
    println!("[2] Relecture legere rejetee={} ; relecture serieuse acceptee={}", cheap.is_err(), serious.is_ok());

    // Quotas
    let mut sched = TokenBucketScheduler::new();
    for id in ["Chidi", "Nia", "Zola", "Ayo"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let q = match sched.schedule_step("Chidi", 15.0) {
        SchedulingDecision::Allowed { remaining_tokens, .. } => remaining_tokens,
        _ => 0.0,
    };
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Chidi quota, reste {q:.1} ; Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    // Conscience
    let st = orch.evaluate_worker(nia, (0, 8.0)).unwrap();
    println!("[4] Nia : dissonance={:.1} apoptose={}", st.dissonance_level, st.is_apoptotic);

    // Resilience : Zola est corrige puis reintegre
    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    println!("[5] Zola reattache={}", orch.delegate_task("Orthographe", (revived.cell_id, "relecture")).is_ok());

    // Endosymbiose : le metricien integre la grammairienne
    orch.trigger_endosymbiosis(chidi, nia).unwrap();
    println!("[6] Chidi<Nia : organites={}\n", orch.active_cells.get(&chidi).unwrap().organelles.len());

    // --- Resultats ---
    let vers = [
        "Le vierge, le vivace et le bel aujourd'hui",
        "Je suis belle, ô mortels, comme un rêve de pierre",
    ];
    let mut counts = Vec::new();
    for v in vers {
        let (total, per_word) = line_syllables(v);
        let cesura = cesura_at_six(&per_word);
        println!("--- VERS ---\n{v}");
        println!("    syllabes={total} ; cesure apres le mot #{:?} (hemistiche=6)", cesura);
        counts.push((total, cesura));
    }

    let etre = subj_imparfait_etre();
    let venir = passe_simple_venir();
    let attendu_etre = [
        "que je fusse", "que tu fusses", "qu'il fût", "que nous fussions",
        "que vous fussiez", "qu'ils fussent",
    ];
    let attendu_venir = [
        "je vins", "tu vins", "il vint", "nous vînmes", "vous vîntes", "ils vinrent",
    ];
    println!("\n--- CONJUGAISON ---");
    println!("être, subj. imparfait : {:?}", etre);
    println!("venir, passe simple   : {:?}", venir);

    let accords = [
        ("cueilli", 'f', 'p'), // Les fleurs que j'ai cueillies
        ("écrit", 'f', 'p'),   // Les lettres que j'ai écrites
        ("lu", 'm', 'p'),      // Les livres que j'ai lus
        ("lavé", 'f', 'p'),    // Elles se sont lavées
    ];
    println!("\n--- ACCORDS ---");
    let mut accord_strs = Vec::new();
    for (base, g, n) in accords {
        let s = accord_pp(base, g, n);
        println!("{base} ({g}.{n}) -> {s}");
        accord_strs.push(s);
    }

    assert_eq!(counts[0].0, 12, "vers 1 doit etre un alexandrin");
    assert_eq!(counts[1].0, 12, "vers 2 doit etre un alexandrin");
    assert_eq!(counts[0].1, Some(3), "cesure de Mallarme apres 'vivace'");
    assert_eq!(counts[1].1, Some(4), "cesure de Baudelaire apres 'mortels'");
    assert_eq!(etre, attendu_etre);
    assert_eq!(venir, attendu_venir);
    assert_eq!(accord_strs[0], "cueillies");
    assert_eq!(accord_strs[1], "écrites");
    assert_eq!(accord_strs[2], "lus");
    assert_eq!(accord_strs[3], "lavées");
    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&chidi).map(|c| c.organelles.len() == 1).unwrap_or(false));

    println!("\nMISSION LICENCE DE FRANCAIS VALIDEE");
}
