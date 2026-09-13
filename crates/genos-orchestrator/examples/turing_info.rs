use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, TokenBucketScheduler};
use std::collections::HashMap;

// --- "Prix Turing" : cryptographie, calculabilite, theorie des nombres ------

// 1. SHA-256 implemente de zero

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

fn sha256(msg: &[u8]) -> [u8; 32] {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let mut data = msg.to_vec();
    let bit_len = (msg.len() as u64) * 8;
    data.push(0x80);
    while data.len() % 64 != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in data.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[4 * i],
                chunk[4 * i + 1],
                chunk[4 * i + 2],
                chunk[4 * i + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let (mut a, mut b, mut c, mut d) = (h[0], h[1], h[2], h[3]);
        let (mut e, mut f, mut g, mut hh) = (h[4], h[5], h[6], h[7]);
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let t1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }
    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[4 * i..4 * i + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// 2. Machine de Turing (programme charge, ruban infini)

struct Tm {
    trans: HashMap<(usize, char), (usize, char, isize)>,
    accept: usize,
}

fn tape_string(tape: &HashMap<isize, char>) -> String {
    let min = *tape.keys().min().unwrap();
    let max = *tape.keys().max().unwrap();
    (min..=max).map(|i| *tape.get(&i).unwrap_or(&'_')).collect()
}

/// Execute la MT ; None si rejet, blocage ou depassement de la limite d'etapes.
fn run_tm(tm: &Tm, tape: &mut HashMap<isize, char>, start: usize, head: isize, limit: usize) -> Option<String> {
    let mut state = start;
    let mut head = head;
    for _ in 0..limit {
        if state == tm.accept {
            return Some(tape_string(tape));
        }
        let sym = *tape.get(&head).unwrap_or(&'_');
        match tm.trans.get(&(state, sym)) {
            Some(&(ns, ws, mv)) => {
                tape.insert(head, ws);
                state = ns;
                head += mv;
            }
            None => return None,
        }
    }
    None
}

fn increment_tm() -> Tm {
    let mut trans = HashMap::new();
    trans.insert((0, '1'), (0, '0', -1));
    trans.insert((0, '0'), (1, '1', 0));
    trans.insert((0, '_'), (1, '1', 0));
    Tm { trans, accept: 1 }
}

fn build_tape(s: &str) -> HashMap<isize, char> {
    s.chars().enumerate().map(|(i, c)| (i as isize, c)).collect()
}

// 3. RSA

fn modpow(mut base: u128, mut exp: u128, modulus: u128) -> u128 {
    let mut result = 1u128;
    base %= modulus;
    while exp > 0 {
        if exp & 1 == 1 {
            result = result * base % modulus;
        }
        exp >>= 1;
        base = base * base % modulus;
    }
    result
}

fn main() {
    println!("=== MISSION 'PRIX TURING' : SHA-256, machine de Turing, RSA ===\n");

    let mut orch = BiomimeticOrchestrator::new("Turing_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Cryptographie", "Hachage"),
        ("Calculabilite", "Machine de Turing"),
        ("Theorie_Nombres", "RSA"),
        ("Verification", "Tests"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let kwame = orch.add_worker("Cryptographie", AgentCell::new("Kwame", "planificateur", "Crypto")).unwrap();
    let tariq = orch.add_worker("Calculabilite", AgentCell::new("Tariq", "eclaireur", "MT")).unwrap();
    let nia = orch.add_worker("Theorie_Nombres", AgentCell::new("Nia", "determination", "RSA")).unwrap();
    let zola = orch.add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Testeur")).unwrap();
    orch.delegate_task("Cryptographie", (kwame, "hacher avec SHA-256")).unwrap();
    orch.delegate_task("Calculabilite", (tariq, "increment binaire")).unwrap();
    orch.delegate_task("Theorie_Nombres", (nia, "chiffrer dechiffrer")).unwrap();
    println!("[1] Tissus Cryptographie/Calculabilite/Theorie_Nombres/Verification ; delegations posees");

    let ok = orch.audit_collusion("Verification", ("Zola", 2000, true));
    println!("[2] Audit preuve lourde={}", ok.is_ok());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Kwame", "Tariq", "Nia", "Zola"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let _ = sched.reward_proof("Kwame", 0.99);
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    orch.trigger_endosymbiosis(kwame, nia).unwrap();
    println!("[4] Zola reattache={} ; Kwame<Nia organites={}\n", orch.delegate_task("Verification", (revived.cell_id, "audit")).is_ok(), orch.active_cells.get(&kwame).unwrap().organelles.len());

    // --- SHA-256 : vecteurs de test NIST ---
    let vides = hex(&sha256(b""));
    let abc = hex(&sha256(b"abc"));
    let phrase = hex(&sha256(b"The quick brown fox jumps over the lazy dog"));
    println!("--- SHA-256 ---");
    println!("empty = {vides}");
    println!("abc   = {abc}");
    println!("fox   = {phrase}");
    assert_eq!(vides, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert_eq!(abc, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert_eq!(phrase, "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592");

    // --- Machine de Turing ---
    let tm = increment_tm();
    println!("--- MACHINE DE TURING (increment binaire) ---");
    for input in ["0", "1011", "111"] {
        let mut tape = build_tape(input);
        let head = input.len() as isize - 1;
        let out = run_tm(&tm, &mut tape, 0, head, 10_000);
        println!("{input} -> {out:?}");
    }
    let mut t0 = build_tape("0");
    assert_eq!(run_tm(&tm, &mut t0, 0, 0, 10_000).as_deref(), Some("1"));
    let mut t1 = build_tape("1011");
    assert_eq!(run_tm(&tm, &mut t1, 0, 3, 10_000).as_deref(), Some("1100"));
    let mut t2 = build_tape("111");
    assert_eq!(run_tm(&tm, &mut t2, 0, 2, 10_000).as_deref(), Some("1000"));

    // Machine qui ne s'arrete jamais (boucle a droite) : indecidabilite illustree.
    let mut boucle = HashMap::new();
    boucle.insert((0, '0'), (0, '0', 1));
    boucle.insert((0, '_'), (0, '_', 1));
    let non_halting = Tm { trans: boucle, accept: 99 };
    let mut tape_boucle = build_tape("0000");
    let res = run_tm(&non_halting, &mut tape_boucle, 0, 0, 1000);
    println!("machine non-halting (limite 1000) = {res:?}");
    assert!(res.is_none());

    // --- RSA ---
    let (p, q, e) = (61u128, 53u128, 17u128);
    let n = p * q;
    let phi = (p - 1) * (q - 1);
    // d = e^{-1} mod phi (petit phi, recherche lineaire)
    let d = (1..phi).find(|k| (e * k) % phi == 1).unwrap();
    let message = 65u128;
    let chiffre = modpow(message, e, n);
    let clair = modpow(chiffre, d, n);
    println!("--- RSA --- n={n} e={e} d={d} ; 65 -> {chiffre} -> {clair}");
    assert_eq!(clair, message);

    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&kwame).map(|c| c.organelles.len() == 1).unwrap_or(false));
    println!("\nMISSION 'PRIX TURING' VALIDEE");
}
