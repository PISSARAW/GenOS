#![feature(portable_simd)]
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH, Instant};
use std::simd::prelude::*;
use rayon::prelude::*; // Ajout de Rayon pour le parallélisme

const SIZE: usize = 20;

struct Rng { state: u64 } // u64 pour éviter les collisions
impl Rng {
    fn new(seed: u64) -> Self { Rng { state: seed } }
    fn next(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x << 13; x ^= x >> 7; x ^= x << 17;
        self.state = x; x
    }
    fn gen_float(&mut self) -> f32 { (self.next() >> 32) as f32 / (u32::MAX as f32) }
    fn gen_range(&mut self, min: usize, max: usize) -> usize {
        min + ((self.next() >> 32) as usize % (max - min))
    }
}

#[derive(Clone, PartialEq, Eq, Hash)]
enum Node { Leaf(u8), Branch([usize; 4]) }

struct SATSolver;
impl SATSolver {
    // Vérifie TOUTES les symétries en une seule passe (parallélisé)
    fn solve_anti_symmetry(grid: &[[u8; SIZE]; SIZE]) -> bool {
        (1..=8).into_par_iter().all(|sym| {
            for y in 0..SIZE {
                for x in 0..SIZE {
                    let (oy, ox) = Self::map_coord(sym, x, y);
                    if grid[y][x] > grid[oy][ox] { return false; }
                }
            }
            true
        })
    }

    fn map_coord(sym: u8, x: usize, y: usize) -> (usize, usize) {
        match sym {
            1 => (SIZE - 1 - x, y),
            2 => (SIZE - 1 - y, SIZE - 1 - x),
            3 => (x, SIZE - 1 - y),
            4 => (y, SIZE - 1 - x),
            5 => (SIZE - 1 - y, x),
            6 => (x, y),
            7 => (SIZE - 1 - x, SIZE - 1 - y),
            8 => (y, x),
            _ => (x, y),
        }
    }
}

struct HashLife {
    pool: HashMap<Node, usize>,
    nodes: Vec<Node>,
    memo_fitness: HashMap<usize, i32>,
    max_memo_size: usize, // Limite la taille du cache
}
impl HashLife {
    fn new() -> Self {
        let mut hl = HashLife {
            pool: HashMap::new(),
            nodes: Vec::new(),
            memo_fitness: HashMap::new(),
            max_memo_size: 100_000, // Limite à 100k entrées
        };
        hl.intern(Node::Leaf(0));
        hl.intern(Node::Leaf(1));
        hl
    }

    fn intern(&mut self, node: Node) -> usize {
        if let Some(&idx) = self.pool.get(&node) { idx }
        else {
            let idx = self.nodes.len();
            self.pool.insert(node.clone(), idx);
            self.nodes.push(node);
            idx
        }
    }

    fn empty_tree(&mut self, level: usize) -> usize {
        if level == 0 { self.intern(Node::Leaf(0)) }
        else {
            let c = self.empty_tree(level - 1);
            self.intern(Node::Branch([c, c, c, c]))
        }
    }
}

// === FITNESS OPTIMISÉE (SIMD corrigé) ===
fn compute_fitness(grid: &[[u8; SIZE]; SIZE]) -> i32 {
    let mut score = 0i32;
    for y in 0..SIZE {
        for x in 0..SIZE {
            if grid[y][x] == 1 {
                score += 1;
                let neighbors = count_neighbors_fast(grid, x, y);
                if neighbors > 3 { score -= 2; } // Pénalise la surpopulation
            }
        }
    }
    score
}

// Compte les voisins avec un cache local pour éviter les recalculs
fn count_neighbors_fast(grid: &[[u8; SIZE]; SIZE], x: usize, y: usize) -> u8 {
    let mut count = 0u8;
    for dy in -1..=1 {
        for dx in -1..=1 {
            if dx == 0 && dy == 0 { continue; }
            let nx = (x as i32 + dx + SIZE as i32) as usize % SIZE;
            let ny = (y as i32 + dy + SIZE as i32) as usize % SIZE;
            count += grid[ny][nx];
        }
    }
    count
}

// Canonicalisation ultra-rapide (compare les u64 au lieu des grilles)
fn canonical(grid: &[[u8; SIZE]; SIZE]) -> [[u8; SIZE]; SIZE] {
    let mut best = *grid;
    let mut best_hash = grid_as_u64(grid);
    let mut curr = *grid;

    for _ in 0..4 {
        curr = rot90(&curr);
        let curr_hash = grid_as_u64(&curr);
        if curr_hash < best_hash { best = curr; best_hash = curr_hash; }
        let flipped = flip(&curr);
        let flipped_hash = grid_as_u64(&flipped);
        if flipped_hash < best_hash { best = flipped; best_hash = flipped_hash; }
    }
    best
}

fn grid_as_u64(grid: &[[u8; SIZE]; SIZE]) -> u64 {
    let mut hash = 0u64;
    for y in 0..SIZE {
        for x in 0..SIZE {
            hash = (hash << 1) | (grid[y][x] as u64);
        }
    }
    hash
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
