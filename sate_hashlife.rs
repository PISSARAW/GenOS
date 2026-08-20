#![feature(portable_simd)]
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH, Instant};
use std::simd::prelude::*;

const SIZE: usize = 20;

struct Rng { state: u32 }
impl Rng {
    fn new(seed: u32) -> Self { Rng { state: seed } }
    fn next(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        self.state = x; x
    }
    fn gen_float(&mut self) -> f32 { (self.next() as f32) / (u32::MAX as f32) }
    fn gen_range(&mut self, min: usize, max: usize) -> usize {
        min + (self.next() as usize % (max - min))
    }
}

#[derive(Clone, PartialEq, Eq, Hash)]
enum Node {
    Leaf(u8),
    Branch([usize; 4]),
}

struct SATSolver;

impl SATSolver {
    fn map_coord(sym: u8, x: usize, y: usize) -> (usize, usize) {
        match sym {
            1 => (SIZE - 1 - x, y),
            2 => (SIZE - 1 - y, SIZE - 1 - x),
            3 => (x, SIZE - 1 - y),
            4 => (y, SIZE - 1 - x),
            5 => (SIZE - 1 - y, x),
            6 => (x, y),
            7 => (SIZE - 1 - x, SIZE - 1 - y),
            _ => (y, x),
        }
    }

    fn eval_clause(grid: &[[u8; SIZE]; SIZE], sym: u8) -> bool {
        for y in 0..SIZE {
            for x in 0..SIZE {
                let (oy, ox) = Self::map_coord(sym, x, y);
                let val1 = grid[y][x];
                let val2 = grid[oy][ox];
                if val1 < val2 { return true; }
                if val1 > val2 { return false; }
            }
        }
        true
    }

    fn solve_anti_symmetry(grid: &[[u8; SIZE]; SIZE]) -> bool {
        for sym in 1..=7 {
            if !Self::eval_clause(grid, sym) {
                return false;
            }
        }
        true
    }
}

struct HashLife {
    pool: HashMap<Node, usize>,
    nodes: Vec<Node>,
    memo_fitness: HashMap<usize, i32>,
}

impl HashLife {
    fn new() -> Self {
        let mut hl = HashLife {
            pool: HashMap::new(),
            nodes: Vec::new(),
            memo_fitness: HashMap::new(),
        };
        hl.intern(Node::Leaf(0));
        hl.intern(Node::Leaf(1));
        hl
    }

    fn intern(&mut self, node: Node) -> usize {
        if let Some(&idx) = self.pool.get(&node) {
            idx
        } else {
            let idx = self.nodes.len();
            self.pool.insert(node.clone(), idx);
            self.nodes.push(node);
            idx
        }
    }

    fn empty_tree(&mut self, level: usize) -> usize {
        if level == 0 {
            self.intern(Node::Leaf(0))
        } else {
            let c = self.empty_tree(level - 1);
            self.intern(Node::Branch([c, c, c, c]))
        }
    }
    
    fn set_cell(&mut self, args: SetCellArgs) -> usize {
        if args.level == 0 {
            return self.intern(Node::Leaf(args.val));
        }
        let half = 1 << (args.level - 1);
        let node = self.nodes[args.node].clone();
        if let Node::Branch(c) = node {
            let mut nw = c[0]; let mut ne = c[1];
            let mut sw = c[2]; let mut se = c[3];
            let (x, y) = args.pos;
            if x < half && y < half { nw = self.set_cell(SetCellArgs { node: nw, pos: (x, y), val: args.val, level: args.level - 1 }); }
            else if x >= half && y < half { ne = self.set_cell(SetCellArgs { node: ne, pos: (x - half, y), val: args.val, level: args.level - 1 }); }
            else if x < half && y >= half { sw = self.set_cell(SetCellArgs { node: sw, pos: (x, y - half), val: args.val, level: args.level - 1 }); }
            else { se = self.set_cell(SetCellArgs { node: se, pos: (x - half, y - half), val: args.val, level: args.level - 1 }); }
            self.intern(Node::Branch([nw, ne, sw, se]))
        } else { unreachable!() }
    }

    fn build_tree(&mut self, args: BuildArgs) -> usize {
        let (x, y) = args.pos;
        if x >= SIZE || y >= SIZE { return self.empty_tree(args.level); }
        if args.level == 0 { return self.intern(Node::Leaf(args.grid[y][x])); }
        let h = 1 << (args.level - 1);
        let nw = self.build_tree(BuildArgs { grid: args.grid, level: args.level - 1, pos: (x, y) });
        let ne = self.build_tree(BuildArgs { grid: args.grid, level: args.level - 1, pos: (x + h, y) });
        let sw = self.build_tree(BuildArgs { grid: args.grid, level: args.level - 1, pos: (x, y + h) });
        let se = self.build_tree(BuildArgs { grid: args.grid, level: args.level - 1, pos: (x + h, y + h) });
        self.intern(Node::Branch([nw, ne, sw, se]))
    }
}

struct SetCellArgs {
    node: usize,
    pos: (usize, usize),
    val: u8,
    level: usize,
}

struct BuildArgs<'a> {
    grid: &'a [[u8; SIZE]; SIZE],
    level: usize,
    pos: (usize, usize),
}

fn rot90(g: &[[u8; SIZE]; SIZE]) -> [[u8; SIZE]; SIZE] {
    let mut res = [[0; SIZE]; SIZE];
    for y in 0..SIZE {
        for x in 0..SIZE { res[x][SIZE - 1 - y] = g[y][x]; }
    }
    res
}

fn flip(g: &[[u8; SIZE]; SIZE]) -> [[u8; SIZE]; SIZE] {
    let mut res = [[0; SIZE]; SIZE];
    for y in 0..SIZE {
        for x in 0..SIZE { res[y][SIZE - 1 - x] = g[y][x]; }
    }
    res
}

fn canonical(grid: &[[u8; SIZE]; SIZE]) -> [[u8; SIZE]; SIZE] {
    let mut best = *grid;
    let mut curr = *grid;
    for _ in 0..4 {
        curr = rot90(&curr);
        if curr < best { best = curr; }
        let f = flip(&curr);
        if f < best { best = f; }
    }
    best
}

struct FillArgs {
    node: usize,
    level: usize,
    pos: (usize, usize),
}

struct GridContext<'a> {
    hl: &'a HashLife,
    grid: &'a mut [[u8; SIZE]; SIZE],
}

impl<'a> GridContext<'a> {
    fn fill(&mut self, args: FillArgs) {
        let (ox, oy) = args.pos;
        if ox >= SIZE || oy >= SIZE { return; }
        if args.level == 0 {
            if let Node::Leaf(val) = self.hl.nodes[args.node] {
                self.grid[oy][ox] = val;
            }
            return;
        }
        let half = 1 << (args.level - 1);
        if let Node::Branch(c) = self.hl.nodes[args.node] {
            self.fill(FillArgs { node: c[0], level: args.level - 1, pos: (ox, oy) }); self.fill(FillArgs { node: c[1], level: args.level - 1, pos: (ox + half, oy) });
            self.fill(FillArgs { node: c[2], level: args.level - 1, pos: (ox, oy + half) }); self.fill(FillArgs { node: c[3], level: args.level - 1, pos: (ox + half, oy + half) });
        }
    }
}

fn count_neighbors(grid: &[[u8; SIZE]; SIZE], pos: (usize, usize)) -> u8 {
    let (x, y) = pos;
    let mut count = 0;
    for dy in -1..=1 {
        for dx in -1..=1 {
            if dx == 0 && dy == 0 { continue; }
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx >= 0 && nx < SIZE as i32 && ny >= 0 && ny < SIZE as i32 {
                count += grid[ny as usize][nx as usize];
            }
        }
    }
    count
}

fn compute_fitness(grid: &[[u8; SIZE]; SIZE]) -> i32 {
    let mut padded = [0u8; 22 * 22 + 32];
    for y in 0..SIZE {
        padded[(y + 1) * 22 + 1 .. (y + 1) * 22 + 1 + SIZE].copy_from_slice(&grid[y]);
    }

    let mut score = 0i32;
    for y in 1..=SIZE {
        let i0 = (y - 1) * 22; let i1 = y * 22; let i2 = (y + 1) * 22;
        let p_tl = u8x32::from_slice(&padded[i0..]); let p_tc = u8x32::from_slice(&padded[i0 + 1..]); let p_tr = u8x32::from_slice(&padded[i0 + 2..]);
        let p_ml = u8x32::from_slice(&padded[i1..]); let p_mc = u8x32::from_slice(&padded[i1 + 1..]); let p_mr = u8x32::from_slice(&padded[i1 + 2..]);
        let p_bl = u8x32::from_slice(&padded[i2..]); let p_bc = u8x32::from_slice(&padded[i2 + 1..]); let p_br = u8x32::from_slice(&padded[i2 + 2..]);

        let sum = p_tl + p_tc + p_tr + p_ml + p_mr + p_bl + p_bc + p_br;
        
        let mask3 = sum.simd_gt(u8x32::splat(3));
        
        let alive_arr = p_mc.to_array();
        let mask3_arr = mask3.to_bitmask();
        
        for x in 0..SIZE {
            if alive_arr[x] == 1 {
                score += 1;
                if (mask3_arr & (1 << x)) != 0 {
                    score -= 2;
                }
            }
        }
    }
    score
}

fn fitness(hl: &mut HashLife, root: usize) -> i32 {
    if let Some(&score) = hl.memo_fitness.get(&root) {
        return score;
    }
    let mut grid = [[0; SIZE]; SIZE];
    let mut ctx = GridContext { hl, grid: &mut grid };
    ctx.fill(FillArgs { node: root, level: 5, pos: (0, 0) });
    
    if !SATSolver::solve_anti_symmetry(&grid) {
        hl.memo_fitness.insert(root, -10000);
        return -10000;
    }
    
    let score = compute_fitness(&grid);
    hl.memo_fitness.insert(root, score);
    score
}

fn get_dead_edges(grid: &[[u8; SIZE]; SIZE]) -> Vec<(usize, usize)> {
    let mut dead = Vec::new();
    for y in 0..SIZE {
        for x in 0..SIZE {
            if grid[y][x] == 0 && count_neighbors(grid, (x, y)) < 2 {
                dead.push((x, y));
            }
        }
    }
    dead
}

fn mutate(hl: &mut HashLife, root: usize, rng: &mut Rng) -> usize {
    let mut grid = [[0; SIZE]; SIZE];
    let mut ctx = GridContext { hl, grid: &mut grid };
    ctx.fill(FillArgs { node: root, level: 5, pos: (0, 0) });
    
    let dead = get_dead_edges(&grid);
    let (mx, my, mval) = if dead.is_empty() {
        let x = rng.gen_range(0, SIZE);
        let y = rng.gen_range(0, SIZE);
        (x, y, grid[y][x] ^ 1)
    } else {
        let idx = rng.gen_range(0, dead.len());
        let (x, y) = dead[idx];
        (x, y, 1)
    };
    
    grid[my][mx] = mval;
    let canon = canonical(&grid);
    hl.build_tree(BuildArgs { grid: &canon, level: 5, pos: (0, 0) })
}

struct AcceptArgs<'a> {
    ns: i32, cs: i32, temp: f32, bs: i32,
    next: usize, tabu: &'a Vec<usize>,
}

fn should_accept(args: AcceptArgs, rng: &mut Rng) -> bool {
    if args.ns > args.bs { return true; }
    if args.tabu.contains(&args.next) { return false; }
    let diff = (args.ns - args.cs) as f32;
    diff > 0.0 || rng.gen_float() < (diff / args.temp).exp()
}

fn simulated_annealing(hl: &mut HashLife, start_root: usize, rng: &mut Rng) -> usize {
    let mut current = start_root;
    let mut best = current;
    let mut current_score = fitness(hl, current);
    let mut best_score = current_score;
    
    let mut temp = 100.0f32;
    let cooling_rate = 0.995f32;
    
    let mut tabu: Vec<usize> = Vec::new();
    let mut stagnation = 0;
    
    let start_time = Instant::now();
    let mut iters = 0;
    
    while start_time.elapsed().as_secs_f32() < 30.0 {
        iters += 1;
        let next = mutate(hl, current, rng);
        let next_score = fitness(hl, next);
        
        let accept_args = AcceptArgs {
            ns: next_score, cs: current_score, temp, bs: best_score, next, tabu: &tabu
        };
        let accept = should_accept(accept_args, rng);
        
        if accept {
            current = next;
            current_score = next_score;
            tabu.push(current);
            if tabu.len() > 20 { tabu.remove(0); }
            
            if current_score > best_score {
                best_score = current_score;
                best = current;
                stagnation = 0;
            } else { stagnation += 1; }
        } else { stagnation += 1; }
        
        if stagnation > 500 {
            current = best;
            current_score = best_score;
            temp = 100.0;
            stagnation = 0;
            tabu.clear();
        }
        
        temp *= cooling_rate;
        if temp < 0.01 { temp = 0.01; }
    }
    
    println!("[TAG: DETERMINISTIC_HARDWARE_LOCK]");
    println!("Total iterations executed in 30 seconds: {}", iters);
    best
}

fn generate_initial(hl: &mut HashLife, rng: &mut Rng) -> usize {
    loop {
        let mut root = hl.empty_tree(5);
        for y in 0..SIZE { for x in 0..SIZE { root = hl.set_cell(SetCellArgs { node: root, pos: (x, y), val: if rng.next() % 4 == 0 { 1 } else { 0 }, level: 5 }); } }
        let mut grid = [[0; SIZE]; SIZE];
        GridContext { hl, grid: &mut grid }.fill(FillArgs { node: root, level: 5, pos: (0, 0) });
        if SATSolver::solve_anti_symmetry(&grid) { return root; }
    }
}

fn main() {
    let start = SystemTime::now();
    let since = start.duration_since(UNIX_EPOCH).unwrap();
    let mut rng = Rng::new(since.subsec_nanos());
    
    let mut hl = HashLife::new();
    let initial = generate_initial(&mut hl, &mut rng);
    
    println!("SATE v4 status : Initialisation avec memoire QuadTree (HashLife).");
    println!("Score de base : {}", fitness(&mut hl, initial));
    
    println!("Lancement de SATE v4...");
    let best = simulated_annealing(&mut hl, initial, &mut rng);
    
    println!("Score SATE v4 atteint : {}", fitness(&mut hl, best));
    println!("Noeuds QuadTree uniques generes : {}", hl.nodes.len());
    println!("Grilles uniques evaluees (memoisees) : {}", hl.memo_fitness.len());
}
