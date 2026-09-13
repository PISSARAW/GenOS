use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, TokenBucketScheduler};
use std::cmp::Reverse;
use std::collections::BinaryHeap;

// --- Master informatique : compilation, algorithmique avancee --------------

// 1. Tokenizer + parseur d'expressions par descente recursive

#[derive(Clone, Debug, PartialEq)]
enum Token {
    Num(f64),
    Plus,
    Minus,
    Star,
    Slash,
    LParen,
    RParen,
}

fn tokenize(src: &str) -> Result<Vec<Token>, String> {
    let mut out = Vec::new();
    let mut chars = src.chars().peekable();
    while let Some(&c) = chars.peek() {
        match c {
            ' ' | '\t' => {
                chars.next();
            }
            '+' => { out.push(Token::Plus); chars.next(); }
            '-' => { out.push(Token::Minus); chars.next(); }
            '*' => { out.push(Token::Star); chars.next(); }
            '/' => { out.push(Token::Slash); chars.next(); }
            '(' => { out.push(Token::LParen); chars.next(); }
            ')' => { out.push(Token::RParen); chars.next(); }
            '0'..='9' | '.' => {
                let mut num = String::new();
                while let Some(&d) = chars.peek() {
                    if d.is_ascii_digit() || d == '.' {
                        num.push(d);
                        chars.next();
                    } else {
                        break;
                    }
                }
                out.push(Token::Num(num.parse::<f64>().map_err(|e| e.to_string())?));
            }
            _ => return Err(format!("caractere invalide: {c}")),
        }
    }
    Ok(out)
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }
    fn next(&mut self) -> Option<Token> {
        let t = self.tokens.get(self.pos).cloned();
        self.pos += 1;
        t
    }
    fn expr(&mut self) -> Result<f64, String> {
        let mut val = self.term()?;
        while let Some(t) = self.peek().cloned() {
            match t {
                Token::Plus => { self.next(); val += self.term()?; }
                Token::Minus => { self.next(); val -= self.term()?; }
                _ => break,
            }
        }
        Ok(val)
    }
    fn term(&mut self) -> Result<f64, String> {
        let mut val = self.factor()?;
        while let Some(t) = self.peek().cloned() {
            match t {
                Token::Star => { self.next(); val *= self.factor()?; }
                Token::Slash => {
                    self.next();
                    let d = self.factor()?;
                    if d == 0.0 {
                        return Err("division par zero".to_string());
                    }
                    val /= d;
                }
                _ => break,
            }
        }
        Ok(val)
    }
    fn factor(&mut self) -> Result<f64, String> {
        match self.next() {
            Some(Token::Num(n)) => Ok(n),
            Some(Token::Minus) => Ok(-self.factor()?),
            Some(Token::LParen) => {
                let v = self.expr()?;
                match self.next() {
                    Some(Token::RParen) => Ok(v),
                    _ => Err("parenthese fermante attendue".to_string()),
                }
            }
            other => Err(format!("facteur inattendu: {other:?}")),
        }
    }
}

fn eval(src: &str) -> Result<f64, String> {
    let mut p = Parser { tokens: tokenize(src)?, pos: 0 };
    let v = p.expr()?;
    if p.pos != p.tokens.len() {
        return Err("tokens en trop".to_string());
    }
    Ok(v)
}

// 2. Distance de Levenshtein (programmation dynamique)

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for i in 1..=a.len() {
        let mut cur = vec![i; b.len() + 1];
        for j in 1..=b.len() {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        prev = cur;
    }
    prev[b.len()]
}

// 3. Plus longue sous-sequence commune

fn lcs(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut dp = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for i in 1..=a.len() {
        for j in 1..=b.len() {
            dp[i][j] = if a[i - 1] == b[j - 1] {
                dp[i - 1][j - 1] + 1
            } else {
                dp[i - 1][j].max(dp[i][j - 1])
            };
        }
    }
    dp[a.len()][b.len()]
}

// 4. Dijkstra + Bellman-Ford (controle croise)

fn dijkstra(adj: &[Vec<(usize, u32)>], src: usize) -> Vec<u32> {
    let n = adj.len();
    let mut dist = vec![u32::MAX; n];
    dist[src] = 0;
    let mut heap = BinaryHeap::new();
    heap.push(Reverse((0u32, src)));
    while let Some(Reverse((d, u))) = heap.pop() {
        if d > dist[u] {
            continue;
        }
        for &(v, w) in &adj[u] {
            let nd = d + w;
            if nd < dist[v] {
                dist[v] = nd;
                heap.push(Reverse((nd, v)));
            }
        }
    }
    dist
}

fn bellman_ford(edges: &[(usize, usize, u32)], n: usize, src: usize) -> Vec<u32> {
    let mut dist = vec![u32::MAX; n];
    dist[src] = 0;
    for _ in 0..n - 1 {
        for &(u, v, w) in edges {
            if dist[u] != u32::MAX && dist[u] + w < dist[v] {
                dist[v] = dist[u] + w;
            }
        }
    }
    dist
}

fn main() {
    println!("=== MISSION MASTER INFORMATIQUE : compil, DP, graphes ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Compilation", "Parseur"),
        ("Programmation_Dynamique", "DP"),
        ("Graphes", "Plus courts chemins"),
        ("Verification", "Tests"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let chidi = orch.add_worker("Compilation", AgentCell::new("Chidi", "logique", "Compilateur")).unwrap();
    let nia = orch.add_worker("Programmation_Dynamique", AgentCell::new("Nia", "determination", "DP")).unwrap();
    let kwame = orch.add_worker("Graphes", AgentCell::new("Kwame", "planificateur", "Graphes")).unwrap();
    let zola = orch.add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Testeur")).unwrap();
    orch.delegate_task("Compilation", (chidi, "parser 3+4*(2-1)")).unwrap();
    orch.delegate_task("Programmation_Dynamique", (nia, "Levenshtein / LCS")).unwrap();
    orch.delegate_task("Graphes", (kwame, "Dijkstra")).unwrap();
    println!("[1] Tissus Compilation/DP/Graphes/Verification ; delegations posees");

    let ok = orch.audit_collusion("Verification", ("Zola", 1300, true));
    println!("[2] Audit preuve lourde={}", ok.is_ok());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Chidi", "Nia", "Kwame", "Zola"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let _ = sched.reward_proof("Chidi", 0.93);
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    orch.trigger_endosymbiosis(chidi, nia).unwrap();
    println!("[4] Zola reattache={} ; Chidi<Nia organites={}\n", orch.delegate_task("Verification", (revived.cell_id, "relire")).is_ok(), orch.active_cells.get(&chidi).unwrap().organelles.len());

    // --- Parseur ---
    println!("--- PARSEUR ---");
    for src in ["3 + 4 * (2 - 1)", "((1+2)*3)", "2 * (3 + 4) - 5", "-3 + 10"] {
        println!("{src} = {}", eval(src).unwrap());
    }
    assert_eq!(eval("3 + 4 * (2 - 1)").unwrap(), 7.0);
    assert_eq!(eval("((1+2)*3)").unwrap(), 9.0);
    assert_eq!(eval("2 * (3 + 4) - 5").unwrap(), 9.0);
    assert_eq!(eval("-3 + 10").unwrap(), 7.0);
    assert!(eval("1 / 0").is_err());
    assert!(eval("(1+2").is_err());

    // --- Programmation dynamique ---
    let lev = levenshtein("kitten", "sitting");
    let l = lcs("ABCBDAB", "BDCABA");
    println!("--- DP ---");
    println!("Levenshtein(kitten, sitting)={lev} ; LCS(ABCBDAB, BDCABA)={l}");
    assert_eq!(lev, 3);
    assert_eq!(l, 4);

    // --- Graphes ---
    let edges = [(0, 1, 4u32), (0, 2, 1), (2, 1, 2), (1, 3, 1), (2, 3, 5), (3, 4, 3)];
    let n = 5;
    let mut adj = vec![Vec::new(); n];
    for &(u, v, w) in &edges {
        adj[u].push((v, w));
        adj[v].push((u, w));
    }
    let d = dijkstra(&adj, 0);
    let bf = bellman_ford(&edges, n, 0);
    println!("--- GRAPHES ---");
    println!("Dijkstra   = {d:?}");
    println!("Bellman-F. = {bf:?}");
    assert_eq!(d, bf, "Dijkstra et Bellman-Ford doivent concorder");

    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&chidi).map(|c| c.organelles.len() == 1).unwrap_or(false));
    println!("\nMISSION MASTER INFORMATIQUE VALIDEE");
}
