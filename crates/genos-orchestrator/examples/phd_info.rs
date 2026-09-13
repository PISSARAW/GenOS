use genos_biology::spore::SporeType;
use genos_cell::AgentCell;
use genos_orchestrator::{BiomimeticOrchestrator, BucketState, TokenBucketScheduler};

// --- Doctorat informatique : SAT, compilation regex, machine virtuelle ------

// 1. Solveur DPLL

fn dpll(clauses: &[Vec<i32>], assign: &mut [i32]) -> bool {
    let satisfies = |lit: i32, assign: &[i32]| -> Option<bool> {
        let idx = lit.unsigned_abs() as usize;
        let a = assign.get(idx).copied().unwrap_or(0);
        if a == 0 {
            None
        } else {
            Some((lit > 0) == (a > 0))
        }
    };
    let mut unit: Option<i32> = None;
    for clause in clauses {
        let mut sat = false;
        let mut unassigned = Vec::new();
        for &lit in clause {
            match satisfies(lit, assign) {
                Some(true) => {
                    sat = true;
                    break;
                }
                Some(false) => {}
                None => unassigned.push(lit),
            }
        }
        if sat {
            continue;
        }
        if unassigned.is_empty() {
            return false; // conflit
        }
        if unassigned.len() == 1 {
            unit = Some(unassigned[0]);
        }
    }
    let all_sat = clauses.iter().all(|c| c.iter().any(|&l| satisfies(l, assign) == Some(true)));
    if all_sat {
        return true;
    }
    if let Some(lit) = unit {
        let idx = lit.unsigned_abs() as usize;
        let save = assign[idx];
        assign[idx] = if lit > 0 { 1 } else { -1 };
        if dpll(clauses, assign) {
            return true;
        }
        assign[idx] = save;
        return false;
    }
    // branchement sur la premiere variable non assignee
    let var = match assign.iter().enumerate().skip(1).find(|(_, a)| **a == 0) {
        Some((i, _)) => i,
        None => return false,
    };
    for val in [1, -1] {
        assign[var] = val;
        if dpll(clauses, assign) {
            return true;
        }
        assign[var] = 0;
    }
    false
}

fn model_satisfies(clauses: &[Vec<i32>], assign: &[i32]) -> bool {
    clauses.iter().all(|c| {
        c.iter().any(|&l| {
            let v = assign[l.unsigned_abs() as usize];
            v != 0 && ((l > 0) == (v > 0))
        })
    })
}

// 2. Regex -> NFA (construction de Thompson)

#[derive(Clone, Debug)]
enum Re {
    Empty,
    Char(char),
    Concat(Box<Re>, Box<Re>),
    Union(Box<Re>, Box<Re>),
    Star(Box<Re>),
}

struct ReParser {
    chars: Vec<char>,
    pos: usize,
}

impl ReParser {
    fn parse(&mut self) -> Re {
        self.union()
    }
    fn union(&mut self) -> Re {
        let mut left = self.concat();
        while self.peek() == Some('|') {
            self.pos += 1;
            let right = self.concat();
            left = Re::Union(Box::new(left), Box::new(right));
        }
        left
    }
    fn concat(&mut self) -> Re {
        let mut left = self.postfix();
        while matches!(self.peek(), Some(c) if c != '|' && c != ')') {
            let right = self.postfix();
            left = Re::Concat(Box::new(left), Box::new(right));
        }
        left
    }
    fn postfix(&mut self) -> Re {
        let mut atom = self.atom();
        while self.peek() == Some('*') {
            self.pos += 1;
            atom = Re::Star(Box::new(atom));
        }
        atom
    }
    fn atom(&mut self) -> Re {
        match self.peek() {
            Some('(') => {
                self.pos += 1;
                let r = self.union();
                if self.peek() == Some(')') {
                    self.pos += 1;
                }
                r
            }
            Some(c) => {
                self.pos += 1;
                Re::Char(c)
            }
            None => Re::Empty,
        }
    }
    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }
}

struct Nfa {
    trans: Vec<(usize, Option<char>, usize)>,
    nstates: usize,
}

impl Nfa {
    fn new() -> Self {
        Nfa { trans: Vec::new(), nstates: 0 }
    }
    fn state(&mut self) -> usize {
        let s = self.nstates;
        self.nstates += 1;
        s
    }
    fn compile(&mut self, re: &Re) -> (usize, usize) {
        match re {
            Re::Empty => {
                let (s, e) = (self.state(), self.state());
                self.trans.push((s, None, e));
                (s, e)
            }
            Re::Char(c) => {
                let (s, e) = (self.state(), self.state());
                self.trans.push((s, Some(*c), e));
                (s, e)
            }
            Re::Concat(a, b) => {
                let (sa, ea) = self.compile(a);
                let (sb, eb) = self.compile(b);
                self.trans.push((ea, None, sb));
                (sa, eb)
            }
            Re::Union(a, b) => {
                let (s, e) = (self.state(), self.state());
                let (sa, ea) = self.compile(a);
                let (sb, eb) = self.compile(b);
                self.trans.push((s, None, sa));
                self.trans.push((s, None, sb));
                self.trans.push((ea, None, e));
                self.trans.push((eb, None, e));
                (s, e)
            }
            Re::Star(a) => {
                let (s, e) = (self.state(), self.state());
                let (sa, ea) = self.compile(a);
                self.trans.push((s, None, sa));
                self.trans.push((s, None, e));
                self.trans.push((ea, None, sa));
                self.trans.push((ea, None, e));
                (s, e)
            }
        }
    }
    fn closure(&self, set: &[bool]) -> Vec<bool> {
        let mut out = set.to_vec();
        let mut stack: Vec<usize> = (0..self.nstates).filter(|&i| out[i]).collect();
        while let Some(s) = stack.pop() {
            for &(from, ch, to) in &self.trans {
                if from == s && ch.is_none() && !out[to] {
                    out[to] = true;
                    stack.push(to);
                }
            }
        }
        out
    }
    fn accepts(&self, start: usize, end: usize, text: &str) -> bool {
        let mut current = vec![false; self.nstates];
        current[start] = true;
        current = self.closure(&current);
        for c in text.chars() {
            let mut next = vec![false; self.nstates];
            for &(from, ch, to) in &self.trans {
                if current[from] && ch == Some(c) {
                    next[to] = true;
                }
            }
            current = self.closure(&next);
        }
        current[end]
    }
}

fn regex_matches(pattern: &str, text: &str) -> bool {
    let re = ReParser { chars: pattern.chars().collect(), pos: 0 }.parse();
    let mut nfa = Nfa::new();
    let (s, e) = nfa.compile(&re);
    nfa.accepts(s, e, text)
}

// 3. Machine virtuelle a registres

#[derive(Clone, Debug)]
enum Instr {
    Push(i64),
    Store(usize),
    Load(usize),
    Sub,
    Mul,
    Jmp(usize),
    Jz(usize),
    Halt,
}

fn run_vm(program: &[Instr], regs: usize) -> i64 {
    let mut registers = vec![0i64; regs];
    let mut stack: Vec<i64> = Vec::new();
    let mut pc = 0usize;
    while pc < program.len() {
        match &program[pc] {
            Instr::Push(n) => stack.push(*n),
            Instr::Store(r) => registers[*r] = stack.pop().unwrap(),
            Instr::Load(r) => stack.push(registers[*r]),
            Instr::Sub => { let b = stack.pop().unwrap(); let a = stack.pop().unwrap(); stack.push(a - b); }
            Instr::Mul => { let b = stack.pop().unwrap(); let a = stack.pop().unwrap(); stack.push(a * b); }
            Instr::Jmp(t) => { pc = *t; continue; }
            Instr::Jz(t) => { if stack.pop().unwrap() == 0 { pc = *t; continue; } }
            Instr::Halt => break,
        }
        pc += 1;
    }
    stack.pop().unwrap_or(registers[1])
}

fn main() {
    println!("=== MISSION DOCTORAT INFORMATIQUE : SAT, regex NFA, machine virtuelle ===\n");

    let mut orch = BiomimeticOrchestrator::new("Griot_Prime", 50.0, 100.0);
    for (name, role) in [
        ("Complexite", "SAT"),
        ("Langages_Formels", "Regex"),
        ("Systemes", "VM"),
        ("Verification", "Tests"),
    ] {
        orch.create_tissue(name, role).unwrap();
    }
    let kwame = orch.add_worker("Complexite", AgentCell::new("Kwame", "planificateur", "SAT")).unwrap();
    let tariq = orch.add_worker("Langages_Formels", AgentCell::new("Tariq", "eclaireur", "Regex")).unwrap();
    let ayo = orch.add_worker("Systemes", AgentCell::new("Ayo", "creativite", "VM")).unwrap();
    let zola = orch.add_worker("Verification", AgentCell::new("Zola", "pacificateur", "Testeur")).unwrap();
    orch.delegate_task("Complexite", (kwame, "resoudre un CNF")).unwrap();
    orch.delegate_task("Langages_Formels", (tariq, "compiler a(b|c)*d")).unwrap();
    orch.delegate_task("Systemes", (ayo, "executer factorielle")).unwrap();
    println!("[1] Tissus Complexite/Langages_Formels/Systemes/Verification ; delegations posees");

    let ok = orch.audit_collusion("Verification", ("Zola", 1500, true));
    println!("[2] Audit preuve lourde={}", ok.is_ok());

    let mut sched = TokenBucketScheduler::new();
    for id in ["Kwame", "Tariq", "Ayo", "Zola"] {
        sched.register_agent(id, 40.0, 100.0);
    }
    let _ = sched.reward_proof("Tariq", 0.97);
    let _ = sched.penalize_waste("Zola", 1.0);
    println!("[3] Zola={:?}", sched.buckets.get("Zola").unwrap().state);

    let idx = orch.sporulate_cell(zola, SporeType::BacterialEndospore).unwrap();
    let revived = orch.germinate_spore(idx, (true, true)).unwrap();
    orch.trigger_endosymbiosis(kwame, tariq).unwrap();
    println!("[4] Zola reattache={} ; Kwame<Tariq organites={}\n", orch.delegate_task("Verification", (revived.cell_id, "audit")).is_ok(), orch.active_cells.get(&kwame).unwrap().organelles.len());

    // --- SAT ---
    let satisfiable = vec![vec![1, 2], vec![-1, 3], vec![-2, -3], vec![1, -3]];
    let unsat = vec![vec![1], vec![-1]];
    let mut a1 = vec![0i32; 4];
    let sat_ok = dpll(&satisfiable, &mut a1);
    let mut a2 = vec![0i32; 2];
    let unsat_ok = dpll(&unsat, &mut a2);
    println!("--- SAT (DPLL) ---");
    println!("CNF satisfiable={sat_ok} modele={:?}", &a1[1..]);
    println!("CNF insatisfiable={unsat_ok}");
    assert!(sat_ok && model_satisfies(&satisfiable, &a1));
    assert!(!unsat_ok);

    // --- Regex ---
    println!("--- REGEX (NFA de Thompson) ---");
    for (pat, txt, exp) in [
        ("a(b|c)*d", "ad", true),
        ("a(b|c)*d", "abcbcd", true),
        ("a(b|c)*d", "ae", false),
        ("ab*", "a", true),
        ("ab*", "abbb", true),
        ("ab*", "b", false),
    ] {
        let got = regex_matches(pat, txt);
        println!("/{pat}/ ~ \"{txt}\" => {got}");
        assert_eq!(got, exp, "regex {pat} sur {txt}");
    }

    // --- VM : factorielle(5) = 120 ---
    let programme = vec![
        Instr::Push(5),
        Instr::Store(0), // n = 5
        Instr::Push(1),
        Instr::Store(1), // acc = 1
        // boucle (index 4)
        Instr::Load(0),
        Instr::Push(1),
        Instr::Sub, // n - 1
        Instr::Jz(17), // si n == 1 -> fin
        Instr::Load(1),
        Instr::Load(0),
        Instr::Mul,
        Instr::Store(1), // acc *= n
        Instr::Load(0),
        Instr::Push(1),
        Instr::Sub,
        Instr::Store(0), // n -= 1
        Instr::Jmp(4),
        // fin (index 17)
        Instr::Load(1),
        Instr::Halt,
    ];
    let fact = run_vm(&programme, 2);
    println!("--- VM --- factorielle(5) = {fact}");
    assert_eq!(fact, 120);

    assert!(matches!(sched.buckets.get("Zola").unwrap().state, BucketState::Apoptotic));
    assert!(orch.active_cells.get(&kwame).map(|c| c.organelles.len() == 1).unwrap_or(false));
    println!("\nMISSION DOCTORAT INFORMATIQUE VALIDEE");
}
