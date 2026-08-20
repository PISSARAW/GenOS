use std::time::{SystemTime, UNIX_EPOCH};

const SIZE: usize = 20;

// Simple random number generator (Xorshift)
struct Rng {
    state: u32,
}

impl Rng {
    fn new(seed: u32) -> Self {
        Rng { state: seed }
    }
    
    fn next(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        x
    }
    
    fn gen_float(&mut self) -> f32 {
        (self.next() as f32) / (u32::MAX as f32)
    }
    
    fn gen_range(&mut self, min: usize, max: usize) -> usize {
        min + (self.next() as usize % (max - min))
    }
}

// 20x20 Binary grid representation
#[derive(Clone)]
struct Grid {
    cells: [[u8; SIZE]; SIZE],
}

impl Grid {
    fn new(rng: &mut Rng) -> Self {
        let mut cells = [[0; SIZE]; SIZE];
        for i in 0..SIZE {
            for j in 0..SIZE {
                // Initialize with some sparsity
                cells[i][j] = if rng.next() % 4 == 0 { 1 } else { 0 };
            }
        }
        Grid { cells }
    }

    fn fitness(&self) -> i32 {
        let mut score = 0;
        for i in 0..SIZE {
            for j in 0..SIZE {
                if self.cells[i][j] == 1 {
                    score += 1;
                    let neighbors = self.count_neighbors(i, j);
                    // Penalize overcrowding to simulate a "complexity pit"
                    if neighbors > 3 {
                        score -= 2;
                    }
                }
            }
        }
        score
    }

    fn count_neighbors(&self, x: usize, y: usize) -> u8 {
        let mut count = 0;
        for dx in -1..=1 {
            for dy in -1..=1 {
                if dx == 0 && dy == 0 {
                    continue;
                }
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx >= 0 && nx < SIZE as i32 && ny >= 0 && ny < SIZE as i32 {
                    count += self.cells[nx as usize][ny as usize];
                }
            }
        }
        count
    }

    // Identifies 'dead edges': inactive cells with few active neighbors
    fn get_dead_edges(&self) -> Vec<(usize, usize)> {
        let mut dead = Vec::new();
        for i in 0..SIZE {
            for j in 0..SIZE {
                if self.cells[i][j] == 0 && self.count_neighbors(i, j) < 2 {
                    dead.push((i, j));
                }
            }
        }
        dead
    }

    fn mutate_directed(&mut self, rng: &mut Rng) {
        let dead_edges = self.get_dead_edges();
        if dead_edges.is_empty() {
            // Random fallback mutation
            let x = rng.gen_range(0, SIZE);
            let y = rng.gen_range(0, SIZE);
            self.cells[x][y] ^= 1;
        } else {
            // Directed hypermutation: target a dead edge and activate it
            let idx = rng.gen_range(0, dead_edges.len());
            let (x, y) = dead_edges[idx];
            self.cells[x][y] = 1;
        }
    }

    fn gen_successors(&self, rng: &mut Rng, count: usize) -> Vec<Grid> {
        let mut successors = Vec::new();
        for _ in 0..count {
            let mut next = self.clone();
            next.mutate_directed(rng);
            successors.push(next);
        }
        successors
    }
}

fn genos_resilience_apoptosis(pool: &mut Vec<Grid>, keep: usize) {
    if pool.len() > keep {
        pool.truncate(keep);
    }
}

fn beam_search(grid: &mut Grid, rng: &mut Rng, width: usize) {
    let mut beam = vec![grid.clone()];
    
    for _ in 0..2000 {
        let mut next_gen = Vec::new();
        
        for g in &beam {
            let mut succ = g.gen_successors(rng, 5);
            next_gen.append(&mut succ);
            next_gen.push(g.clone());
        }
        
        next_gen.sort_by_key(|g| -g.fitness());
        next_gen.dedup_by_key(|g| g.fitness());
        
        genos_resilience_apoptosis(&mut next_gen, width);
        beam = next_gen;
    }
    
    if !beam.is_empty() {
        *grid = beam[0].clone();
    }
}

fn main() {
    let start = SystemTime::now();
    let since_the_epoch = start.duration_since(UNIX_EPOCH).unwrap();
    let mut rng = Rng::new(since_the_epoch.subsec_nanos());

    let mut grid = Grid::new(&mut rng);
    
    println!("SATE v2 status : Fosse de complexite atteinte.");
    println!("Score de base (pre-catastrophe) : {}", grid.fitness());
    
    println!("Lancement de SATE v2 avec Beam Search (Delta-3) - Faisceau etendu...");
    
    beam_search(&mut grid, &mut rng, 50);
    
    println!("Score SATE v2 (Beam Search) atteint : {}", grid.fitness());
}
