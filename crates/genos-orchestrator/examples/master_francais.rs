use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, TokenBucketScheduler};

// --- Master de francais : prosodie du sonnet et figures de style ------------

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

fn lex(line: &str) -> Vec<String> {
    line.split(|c: char| !c.is_alphabetic())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase())
        .collect()
}

/// Cle de rime : de la derniere voyelle prononcee jusqu'a la fin, l'e muet
/// final (feminin) etant conserve pour distinguer "fine" (<ine>) de "latin" (<in>).
fn rhyme_key(word: &str) -> String {
    let chars: Vec<char> = word
        .chars()
        .map(|c| normalize(c.to_ascii_lowercase()))
        .collect();
    let mut last_v = None;
    for (i, c) in chars.iter().enumerate() {
        if is_vowel(*c) {
            last_v = Some(i);
        }
    }
    let mut idx = match last_v {
        Some(i) => i,
        None => return String::new(),
    };
    let silent_e = (idx + 1 == chars.len() && chars[idx] == 'e')
        || (idx + 2 == chars.len() && chars[idx] == 'e' && chars[idx + 1] == 's');
    if silent_e
        && let Some(previous_vowel) = (0..idx).rev().find(|&i| is_vowel(chars[i]))
    {
        idx = previous_vowel;
    }
    chars[idx..].iter().collect()
}

/// Schema de rimes (A, B, C...) deduit des terminaisons.
fn rime_scheme(lines: &[&str]) -> String {
    let mut keys: Vec<String> = Vec::new();
    let mut out = String::new();
    for line in lines {
        let key = lex(line).pop().map(|w| rhyme_key(&w)).unwrap_or_default();
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

/// Nombre de phonemes graphiques partages a la rime (richesse).
fn common_suffix_len(a: &str, b: &str) -> usize {
    a.chars()
        .rev()
        .zip(b.chars().rev())
        .take_while(|(x, y)| x == y)
        .count()
}

fn richness(shared: usize) -> &'static str {
    if shared >= 3 {
        "riche"
    } else if shared == 2 {
        "suffisante"
    } else {
        "pauvre"
    }
}

fn first_word(line: &str) -> String {
    lex(line).first().cloned().unwrap_or_default()
}

/// Figure d'anaphore : meme mot initial repete sur au moins `min` vers.
fn anaphore(lines: &[&str], min: usize) -> Option<String> {
    let heads: Vec<String> = lines.iter().map(|l| first_word(l)).collect();
    let mut best: Option<String> = None;
    for h in &heads {
        let n = heads.iter().filter(|x| *x == h).count();
        if n >= min {
            best = Some(h.clone());
        }
    }
    best
}

/// Nombre d'occurrences d'une lettre (alliteration).
fn count_letter(line: &str, letter: char) -> usize {
    line.chars()
        .map(|c| normalize(c.to_ascii_lowercase()))
        .filter(|c| *c == letter)
        .count()
}

fn main() {
    println!("=== MISSION MASTER DE FRANCAIS : sonnet, rimes, figures ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Prosodie", "Versification"),
        ("Rhetorique", "Figures"),
        ("Stylistique", "Rimes"),
        ("Verification", "Preuves"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let chidi = orch
        .add_worker("Prosodie", AgentCell::new("Chidi", "logique", "Prosodiste"))
        .unwrap();
    let nia = orch
        .add_worker("Rhetorique", AgentCell::new("Nia", "determination", "Rheteuse"))
        .unwrap();
    let _zola = orch
        .add_worker("Stylistique", AgentCell::new("Zola", "pacificateur", "Stylicienne"))
        .unwrap();
    let ayo = orch
        .add_worker("Verification", AgentCell::new("Ayo", "creativite", "Verificateur"))
        .unwrap();
    orch.delegate_task("Prosodie", (chidi, "schema de rimes du sonnet")).unwrap();
    orch.delegate_task("Rhetorique", (nia, "anaphore et alliteration")).unwrap();
    println!("[1] Tissus Prosodie/Rhetorique/Stylistique/Verification ; delegations posees");

    let cheap = orch.audit_collusion("Verification", ("Ayo", 100, true));
    let serious = orch.audit_collusion("Verification", ("Ayo", 1200, true));
    println!("[2] Signal leger rejete={} ; signal couteux accepte={}", cheap.is_err(), serious.is_ok());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Chidi", "Nia", "Zola", "Ayo"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let _ = sched.reward_proof("Chidi", 0.9);
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    let idx = orch.sporulate_cell(ayo, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    orch.trigger_endosymbiosis(chidi, nia).unwrap();
    println!("[4] Ayo reattache={} ; Chidi<Nia organites={}\n", orch.delegate_task("Verification", (revived.cell_id, "relire")).is_ok(), orch.active_cells.get(&chidi).unwrap().organelles.len());

    // --- Sonnet de Du Bellay : structure 4/4/3/3 et rimes ABBA ABBA CCD EED ---
    let sonnet = "\
Heureux qui, comme Ulysse, a fait un beau voyage,
Ou comme cestuy-là qui conquit la toison,
Et puis est retourné, plein d'usage et raison,
Vivre entre ses parents le reste de son âge !

Quand reverrai-je, hélas, de mon petit village
Fumer la cheminée, et en quelle saison
Reverrai-je le clos de ma pauvre maison,
Qui m'est une province, et beaucoup davantage ?

Plus me plaît le séjour qu'ont bâti mes aïeux,
Que des palais Romains le front audacieux,
Plus que le marbre dur me plaît l'ardoise fine,

Plus mon Loire gaulois, que le Tibre latin,
Plus mon petit Liré, que le mont Palatin,
Et plus que l'air marin la douceur angevine.";
    let verses: Vec<&str> = sonnet.lines().filter(|l| !l.trim().is_empty()).collect();
    let scheme = rime_scheme(&verses);
    println!("--- SONNET ---");
    println!("vers = {} (attendu 14)", verses.len());
    println!("rimes = {scheme} (attendu ABBAABBACCDEED)");

    let voyage = rhyme_key("voyage");
    let age = rhyme_key("âge");
    let toison = rhyme_key("toison");
    let raison = rhyme_key("raison");
    let fine = rhyme_key("fine");
    let latin = rhyme_key("latin");
    println!("cles : voyage='{voyage}' age='{age}' toison='{toison}' raison='{raison}' fine='{fine}' latin='{latin}'");
    println!(
        "richesse(voyage/age)={} ; richesse(toison/raison)={}",
        richness(common_suffix_len(&voyage, &age)),
        richness(common_suffix_len(&toison, &raison))
    );

    // --- Figures de style ---
    let corneille = [
        "Rome, l'unique objet de mon ressentiment !",
        "Rome, à qui vient ton bras d'immoler mon amant !",
        "Rome qui t'a vu naître, et que ton cœur adore !",
        "Rome enfin que je hais parce qu'elle t'honore !",
    ];
    let racine = "Pour qui sont ces serpents qui sifflent sur vos têtes ?";
    let ana = anaphore(&corneille, 3);
    let sifflantes = count_letter(racine, 's');
    println!("--- FIGURES ---");
    println!("anaphore = {ana:?} ; alliteration en [s] = {sifflantes}");

    assert_eq!(verses.len(), 14);
    assert_eq!(scheme, "ABBAABBACCDEED");
    assert_eq!(richness(common_suffix_len(&voyage, &age)), "riche");
    assert_eq!(richness(common_suffix_len(&toison, &raison)), "suffisante");
    assert_eq!(ana.as_deref(), Some("rome"));
    assert!(sifflantes >= 6, "alliteration en [s] insuffisante");
    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&chidi).map(|c| c.organelles.len() == 1).unwrap_or(false));

    println!("\nMISSION MASTER DE FRANCAIS VALIDEE");
}
