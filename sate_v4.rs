use std::time::{SystemTime, UNIX_EPOCH};
use std::collections::HashMap;

const SIZE: usize = 20;
const N_CELLS: usize = SIZE * SIZE;

struct Rng { state: u64 }
impl Rng {
    fn new(seed: u64) -> Self {
        let mut state = seed;
        if state == 0 { state = 1; }
        Self { state }
    }
    fn next(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.state = x;
        x
    }
    fn gen_range(&mut self, min: usize, max: usize) -> usize {
        if max <= min { return min; }
        min + (self.next() as usize % (max - min))
    }
}

struct Zobrist { table: [u64; N_CELLS] }
impl Zobrist {
    fn new(rng: &mut Rng) -> Self {
        let mut table = [0; N_CELLS];
        for i in 0..N_CELLS { table[i] = rng.next(); }
        Self { table }
    }
}

#[derive(Clone, PartialEq)]
struct Grid { cells: [[u8; SIZE]; SIZE] }
impl Grid {
    fn new(rng: &mut Rng) -> Self {
        let mut cells = [[0; SIZE]; SIZE];
        for i in 0..SIZE {
            for j in 0..SIZE {
                cells[i][j] = if rng.next() % 4 == 0 { 1 } else { 0 };
            }
        }
        Self { cells }
    }
    fn hash(&self, z: &Zobrist) -> u64 {
        let mut h = 0;
        for i in 0..SIZE {
            for j in 0..SIZE {
                if self.cells[i][j] == 1 { h ^= z.table[i * SIZE + j]; }
            }
        }
        h
    }
    fn count_neighbors(&self, x: usize, y: usize) -> u8 {
        let mut count = 0;
        let xi = x as i32;
        let yi = y as i32;
        for dx in -1..=1 {
            for dy in -1..=1 {
                if dx == 0 && dy == 0 { continue; }
                let nx = xi + dx;
                let ny = yi + dy;
                if nx >= 0 && nx < SIZE as i32 && ny >= 0 && ny < SIZE as i32 {
                    count += self.cells[nx as usize][ny as usize];
                }
            }
        }
        count
    }
    fn fitness(&self) -> i32 {
        let mut score = 0;
        for i in 0..SIZE {
            for j in 0..SIZE {
                if self.cells[i][j] == 1 {
                    score += 1;
                    if self.count_neighbors(i, j) > 3 {
                        score -= 2;
                    }
                }
            }
        }
        score
    }
    fn flip(&mut self, idx: usize) {
        self.cells[idx / SIZE][idx % SIZE] ^= 1;
    }
    fn get_dead_edges(&self) -> Vec<usize> {
        let mut dead = Vec::new();
        for i in 0..SIZE {
            for j in 0..SIZE {
                if self.cells[i][j] == 0 && self.count_neighbors(i, j) < 2 {
                    dead.push(i * SIZE + j);
                }
            }
        }
        dead
    }
    fn mutate_directed(&mut self, rng: &mut Rng) -> usize {
        let dead = self.get_dead_edges();
        if dead.is_empty() {
            let idx = rng.gen_range(0, N_CELLS);
            self.flip(idx);
            idx
        } else {
            let idx = dead[rng.gen_range(0, dead.len())];
            self.cells[idx / SIZE][idx % SIZE] = 1;
            idx
        }
    }
}

struct Node {
    visits: u32,
    score_sum: f64,
    base_fitness: i32,
    unexplored: Vec<usize>,
    children: Vec<usize>,
}
impl Node {
    fn new(base_fitness: i32, rng: &mut Rng) -> Self {
        let mut unexplored = Vec::new();
        // Branching factor limited to 30 for depth
        for _ in 0..30 {
            unexplored.push(rng.gen_range(0, N_CELLS));
        }
        Self { visits: 0, score_sum: 0.0, base_fitness, unexplored, children: Vec::new() }
    }
}

struct MCTS {
    nodes: HashMap<u64, Node>,
    zobrist: Zobrist,
}
impl MCTS {
    fn new(zobrist: Zobrist) -> Self {
        Self { nodes: HashMap::new(), zobrist }
    }
    fn select_action(&self, hash: u64, current_hash: u64) -> usize {
        let node = self.nodes.get(&hash).unwrap();
        let mut best_action = 0;
        let mut best_ucb = -1000000.0;
        let ln_n = (node.visits as f64).ln();
        
        for &act in &node.children {
            let child_hash = current_hash ^ self.zobrist.table[act];
            if let Some(child) = self.nodes.get(&child_hash) {
                if child.visits == 0 { continue; }
                let mean = child.score_sum / (child.visits as f64);
                let ucb = mean + 1.41 * (ln_n / child.visits as f64).sqrt();
                if ucb > best_ucb {
                    best_ucb = ucb;
                    best_action = act;
                }
            }
        }
        best_action
    }
    
    fn step(&mut self, root: &Grid, rng: &mut Rng) -> (Grid, i32, bool) {
        let mut current_grid = root.clone();
        let mut current_hash = current_grid.hash(&self.zobrist);
        let mut path = Vec::new();
        let mut collision = false;
        
        let mut depth = 0;
        loop {
            depth += 1;
            if depth > 50 { break; }
            if let Some(node) = self.nodes.get(&current_hash) {
                if node.base_fitness != current_grid.fitness() { collision = true; }
            }
            let is_leaf = if let Some(n) = self.nodes.get(&current_hash) {
                !n.unexplored.is_empty() || n.children.is_empty()
            } else { true };
            if is_leaf { break; }
            
            let best_action = self.select_action(current_hash, current_hash);
            path.push(current_hash);
            current_grid.flip(best_action);
            current_hash ^= self.zobrist.table[best_action];
        }
        
        if !self.nodes.contains_key(&current_hash) {
            self.nodes.insert(current_hash, Node::new(current_grid.fitness(), rng));
        }
        let node = self.nodes.get_mut(&current_hash).unwrap();
        if let Some(act) = node.unexplored.pop() {
            node.children.push(act);
            path.push(current_hash);
            current_grid.flip(act);
            current_hash ^= self.zobrist.table[act];
            if !self.nodes.contains_key(&current_hash) {
                self.nodes.insert(current_hash, Node::new(current_grid.fitness(), rng));
            }
        }
        
        let mut sim_grid = current_grid.clone();
        // Simulation rollout
        for _ in 0..15 {
            sim_grid.mutate_directed(rng);
        }
        let score = sim_grid.fitness();
        
        path.push(current_hash);
        for h in path {
            if let Some(n) = self.nodes.get_mut(&h) {
                n.visits += 1;
                n.score_sum += score as f64;
            }
        }
        (sim_grid, score, collision)
    }
}

fn main() {
    let start = SystemTime::now();
    let since_the_epoch = start.duration_since(UNIX_EPOCH).unwrap();
    let mut rng = Rng::new(since_the_epoch.subsec_nanos() as u64);
    
    let grid = Grid::new(&mut rng);
    println!("SATE v4 status : Initialisation MCTS + Zobrist 64-bits.");
    println!("Score de base : {}", grid.fitness());
    
    let zobrist = Zobrist::new(&mut rng);
    let mut mcts = MCTS::new(zobrist);
    
    let mut best_score = grid.fitness();
    let mut collisions = 0;
    
    for _ in 0..200_000 {
        let (_, score, collision) = mcts.step(&grid, &mut rng);
        if collision {
            collisions += 1;
        }
        if score > best_score {
            best_score = score;
        }
    }
    
    for node in mcts.nodes.values() {
        if node.base_fitness > best_score {
            best_score = node.base_fitness;
        }
    }
    
    println!("Score SATE v4 atteint : {}", best_score);
    println!("Noeuds MCTS en RAM : {}", mcts.nodes.len());
    if collisions > 0 {
        println!("COLLISION ZOBRIST DETECTEE ! ({} occurrences)", collisions);
    }
}
