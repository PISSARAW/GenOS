use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, TokenBucketScheduler};
use std::collections::HashSet;

// --- "Prix Goncourt" : palmares stylistique et poeme a forme fixe -----------

fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphabetic())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase())
        .collect()
}

fn subordonnants(text: &str) -> usize {
    let marqueurs = ["que", "qui", "dont", "ou", "lorsque", "comme", "quand"];
    tokenize(text)
        .iter()
        .filter(|t| marqueurs.contains(&t.as_str()))
        .count()
}

fn phrases_longues(text: &str, seuil: usize) -> usize {
    text.split(['.', '!', '?', ';'])
        .filter(|p| tokenize(p).len() >= seuil)
        .count()
}

fn variete_ponctuation(text: &str) -> usize {
    [',', ';', ':', '!', '?', '"']
        .iter()
        .filter(|p| text.contains(**p))
        .count()
}

fn alliterations(text: &str) -> usize {
    let toks = tokenize(text);
    let joined: String = toks.concat();
    let mut counts = [0usize; 26];
    for c in joined.chars() {
        let i = (c as u8 - b'a') as usize;
        if i < 26 {
            counts[i] += 1;
        }
    }
    let max = counts.iter().copied().max().unwrap_or(0);
    if joined.is_empty() {
        0
    } else {
        (max as f64 / joined.len() as f64 * 100.0) as usize
    }
}

fn richesse(text: &str) -> f64 {
    let toks = tokenize(text);
    let types: HashSet<&String> = toks.iter().collect();
    types.len() as f64 / toks.len().max(1) as f64
}

/// Score "Goncourt" : hypotaxe, phrases longues, ponctuation, figures.
fn score_goncourt(text: &str) -> f64 {
    3.0 * subordonnants(text) as f64
        + 2.0 * phrases_longues(text, 12) as f64
        + 4.0 * variete_ponctuation(text) as f64
        + 2.0 * alliterations(text) as f64
        + 10.0 * richesse(text)
}

// --- Detection de rime (pour le quatrain) ---

fn normalize(c: char) -> char {
    match c {
        'à' | 'â' | 'ä' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'î' | 'ï' => 'i',
        'ô' | 'ö' => 'o',
        'ù' | 'û' | 'ü' => 'u',
        'œ' => 'e',
        'ç' => 'c',
        _ => c,
    }
}

fn is_vowel(c: char) -> bool {
    matches!(c, 'a' | 'e' | 'i' | 'o' | 'u' | 'y')
}

fn rhyme_key(word: &str) -> String {
    let chars: Vec<char> = word.chars().map(|c| normalize(c.to_ascii_lowercase())).collect();
    let mut last_v = None;
    for (i, c) in chars.iter().enumerate() {
        if is_vowel(*c) {
            last_v = Some(i);
        }
    }
    let mut idx = last_v.unwrap_or(0);
    let silent_e = (idx + 1 == chars.len() && chars[idx] == 'e')
        || (idx + 2 == chars.len() && chars[idx] == 'e' && chars[idx + 1] == 's');
    if silent_e
        && let Some(previous_vowel) = (0..idx).rev().find(|&i| is_vowel(chars[i]))
    {
        idx = previous_vowel;
    }
    chars[idx..].iter().collect()
}

fn rime_scheme(lines: &[&str]) -> String {
    let mut keys: Vec<String> = Vec::new();
    let mut out = String::new();
    for line in lines {
        let key = tokenize(line).pop().map(|w| rhyme_key(&w)).unwrap_or_default();
        let idx = match keys.iter().position(|k| k == &key) {
            Some(i) => i,
            None => {
                keys.push(key);
                keys.len() - 1
            }
        };
        out.push((b'A' + idx as u8) as char);
    }
    out
}

fn main() {
    println!("=== MISSION 'PRIX GONCOURT' : palmares et quatrain ===\n");

    let mut orch = BiomimeticOrchestrator::new("Academie_Goncourt", 50.0, 100.0);
    for (name, role) in [
        ("Comite_Lecture", "Selection"),
        ("Stylistique", "Analyse"),
        ("Poesie", "Vers"),
        ("Verification", "Preuves"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let kwame = orch
        .add_worker("Comite_Lecture", AgentCell::new("Kwame", "planificateur", "Lecteur"))
        .unwrap();
    let nia = orch
        .add_worker("Stylistique", AgentCell::new("Nia", "determination", "Stylicienne"))
        .unwrap();
    let tariq = orch
        .add_worker("Poesie", AgentCell::new("Tariq", "eclaireur", "Poete"))
        .unwrap();
    let _zola = orch
        .add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Verificateur"))
        .unwrap();
    orch.delegate_task("Comite_Lecture", (kwame, "classer les 3 extraits")).unwrap();
    orch.delegate_task("Poesie", (tariq, "composer un quatrain ABBA")).unwrap();
    println!("[1] Academie Goncourt : 4 tissus / 4 membres ; lecture + poesie lancees");

    let ok = orch.audit_collusion("Verification", ("Zola", 1600, true));
    println!("[2] Serment des lecteurs (signal couteux)={}", ok.is_ok());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Kwame", "Nia", "Tariq", "Zola"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let _ = sched.reward_proof("Tariq", 0.98);
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Tariq recompense ; Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    let idx = orch.sporulate_cell(nia, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    orch.trigger_endosymbiosis(kwame, tariq).unwrap();
    println!("[4] Nia reattache={} ; Kwame<Tariq organites={}\n", orch.delegate_task("Stylistique", (revived.cell_id, "relecture")).is_ok(), orch.active_cells.get(&kwame).unwrap().organelles.len());

    let extraits = [
        ("Proust (extrait long)",
         "Longtemps, je me suis couche de bonne heure. Parfois, a peine ma bougie eteinte, mes yeux se fermaient si vite que je n'avais pas le temps de me dire : je m'endors. Et, une demi-heure apres, la pensee qu'il etait temps de chercher le sommeil m'eveillait ; je voulais poser le volume que je croyais avoir encore dans les mains, et souffler ma lumiere ; je n'avais pas cesse en dormant de faire des reflexions sur ce que je venais de lire, mais ces reflexions avaient pris un tour un peu particulier ; il me semblait que j'etais moi-meme ce dont parlait l'ouvrage."),
        ("Presse (article)",
         "Le gouvernement a annonce mardi une reforme du systeme de retraite. Le projet sera presente au Parlement en janvier. Les syndicats ont reagi rapidement et demandent des negociations. Une greve est possible."),
        ("SMS",
         "bonjour ca va moi ca va merci on se voit demain bisous"),
    ];

    println!("--- PALMARES ---");
    let mut scores = Vec::new();
    for (nom, texte) in extraits {
        let s = score_goncourt(texte);
        println!(
            "{nom}: score={s:.1} (subord={}, longues={}, ponct={}, allit={}, ttr={:.2})",
            subordonnants(texte),
            phrases_longues(texte, 12),
            variete_ponctuation(texte),
            alliterations(texte),
            richesse(texte)
        );
        scores.push(s);
    }
    let gagnant = if scores[0] > scores[1] && scores[0] > scores[2] {
        "Proust"
    } else {
        "?"
    };
    println!("Prix Goncourt -> {gagnant}");

    // --- Quatrain a rimes embrassees (ABBA) ---
    let quatrain = [
        "Le vent dans les roseaux chante une vieille histoire,",
        "Et la lune se mire au miroir du bassin,",
        "Le silence descend sur le jardin voisin,",
        "Et mon cœur se souvient d'un rayon de mémoire.",
    ];
    let scheme = rime_scheme(&quatrain);
    println!("\n--- QUATRAIN ---");
    for v in quatrain {
        println!("{v}");
    }
    println!("rimes = {scheme} (attendu ABBA)");

    assert!(scores[0] > scores[1] && scores[1] > scores[2], "le palmares doit croitre Proust > Presse > SMS");
    assert_eq!(scheme, "ABBA");
    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&kwame).map(|c| c.organelles.len() == 1).unwrap_or(false));

    println!("\nMISSION 'PRIX GONCOURT' VALIDEE");
}
