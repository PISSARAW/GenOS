use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, TokenBucketScheduler};

// --- Licence informatique : algorithmique fondamentale ----------------------

fn quicksort(v: &mut [i32]) -> usize {
    fn part(v: &mut [i32], lo: isize, hi: isize, cmp: &mut usize) -> isize {
        let pivot = v[hi as usize];
        let mut i = lo - 1;
        for j in lo..hi {
            *cmp += 1;
            if v[j as usize] <= pivot {
                i += 1;
                v.swap(i as usize, j as usize);
            }
        }
        v.swap((i + 1) as usize, hi as usize);
        i + 1
    }
    fn rec(v: &mut [i32], lo: isize, hi: isize, cmp: &mut usize) {
        if lo < hi {
            let p = part(v, lo, hi, cmp);
            rec(v, lo, p - 1, cmp);
            rec(v, p + 1, hi, cmp);
        }
    }
    let mut cmp = 0;
    let n = v.len();
    if n > 1 {
        rec(v, 0, n as isize - 1, &mut cmp);
    }
    cmp
}

fn binary_search(sorted: &[i32], target: i32) -> Option<usize> {
    let (mut lo, mut hi) = (0isize, sorted.len() as isize - 1);
    while lo <= hi {
        let mid = (lo + hi) / 2;
        match sorted[mid as usize].cmp(&target) {
            std::cmp::Ordering::Equal => return Some(mid as usize),
            std::cmp::Ordering::Less => lo = mid + 1,
            std::cmp::Ordering::Greater => hi = mid - 1,
        }
    }
    None
}

fn is_palindrome(s: &str) -> bool {
    let chars: Vec<char> = s
        .chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    chars.iter().eq(chars.iter().rev())
}

fn is_anagram(a: &str, b: &str) -> bool {
    let mut ca: Vec<char> = a.chars().filter(|c| c.is_alphanumeric()).map(|c| c.to_ascii_lowercase()).collect();
    let mut cb: Vec<char> = b.chars().filter(|c| c.is_alphanumeric()).map(|c| c.to_ascii_lowercase()).collect();
    ca.sort_unstable();
    cb.sort_unstable();
    ca == cb
}

fn fib_dp(n: usize) -> u64 {
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 0..n {
        let next = a + b;
        a = b;
        b = next;
    }
    a
}

fn main() {
    println!("=== MISSION LICENCE INFORMATIQUE : tri, recherche, structures ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Algorithmique", "Tri"),
        ("Structures", "Recherche"),
        ("Chaines", "Texte"),
        ("Verification", "Tests"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let chidi = orch.add_worker("Algorithmique", AgentCell::new("Chidi", "logique", "Algo")).unwrap();
    let nia = orch.add_worker("Structures", AgentCell::new("Nia", "determination", "Structures")).unwrap();
    let tariq = orch.add_worker("Chaines", AgentCell::new("Tariq", "eclaireur", "Chaines")).unwrap();
    let zola = orch.add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Testeur")).unwrap();
    orch.delegate_task("Algorithmique", (chidi, "trier 1000 entiers")).unwrap();
    orch.delegate_task("Structures", (nia, "recherche binaire")).unwrap();
    orch.delegate_task("Chaines", (tariq, "palindrome / anagramme")).unwrap();
    println!("[1] Tissus Algorithmique/Structures/Chaines/Verification ; delegations posees");

    let cheap = orch.audit_collusion("Verification", ("Zola", 90, true));
    let serious = orch.audit_collusion("Verification", ("Zola", 1100, true));
    println!("[2] Signal faible rejete={} ; signal couteux accepte={}", cheap.is_err(), serious.is_ok());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Chidi", "Nia", "Tariq", "Zola"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let _ = sched.reward_proof("Chidi", 0.9);
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    orch.trigger_endosymbiosis(chidi, nia).unwrap();
    println!("[4] Zola reattache={} ; Chidi<Nia organites={}\n", orch.delegate_task("Verification", (revived.cell_id, "relire")).is_ok(), orch.active_cells.get(&chidi).unwrap().organelles.len());

    // --- Tri & recherche ---
    let mut data: Vec<i32> = (0..1000).map(|i| (i * 7919) % 10007 - 5000).collect();
    let mut reference = data.clone();
    reference.sort_unstable();
    let cmp = quicksort(&mut data);
    let n = data.len() as f64;
    let borne = 2.0 * n * n.log2();
    println!("--- TRI ---");
    println!("n={} comparaisons={} borne O(n log n)={berne:.0}", data.len(), cmp, berne = borne);
    assert_eq!(data, reference, "quicksort doit trier correctement");
    assert!((cmp as f64) < borne, "trop de comparaisons pour O(n log n)");

    let target = data[123];
    let pos = binary_search(&data, target).unwrap();
    println!("--- RECHERCHE --- target={target} position={pos} ok={}", data[pos] == target);
    assert_eq!(data[pos], target);
    assert!(binary_search(&data, 20000).is_none());

    // --- Chaines ---
    let phrase = "Elu par cette crapule";
    let a = "Chien";
    let b = "Chine";
    println!("--- CHAINES ---");
    println!("palindrome('{phrase}')={} ; anagramme('{a}','{b}')={}", is_palindrome(phrase), is_anagram(a, b));
    assert!(is_palindrome(phrase));
    assert!(is_anagram(a, b));
    assert!(!is_anagram("abc", "abd"));

    let f = fib_dp(30);
    println!("fib(30)={f}");
    assert_eq!(f, 832_040);

    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&chidi).map(|c| c.organelles.len() == 1).unwrap_or(false));
    println!("\nMISSION LICENCE INFORMATIQUE VALIDEE");
}
