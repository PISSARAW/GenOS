use std::time::{SystemTime, UNIX_EPOCH};

const SIZE: usize = 20;

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

#[derive(Clone, PartialEq)]
struct Grid {
    cells: [[u8; SIZE]; SIZE],
}

impl Grid {
    fn new(rng: &mut Rng) -> Self {
        let mut cells = [[0; SIZE]; SIZE];
        for i in 0..SIZE {
            for j in 0..SIZE {
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
            let x = rng.gen_range(0, SIZE);
            let y = rng.gen_range(0, SIZE);
            self.cells[x][y] ^= 1;
        } else {
            let idx = rng.gen_range(0, dead_edges.len());
            let (x, y) = dead_edges[idx];
            self.cells[x][y] = 1;
        }
    }
}

fn simulated_annealing(grid: &mut Grid, rng: &mut Rng, initial_temp: f32) {
    let mut current_score = grid.fitness();
    let mut best_score = current_score;
    let mut best_grid = grid.clone();
    
    let mut temp = initial_temp;
    let cooling_rate = 0.99;
    
    // Tabu list for memory
    let mut tabu_list: Vec<Grid> = Vec::new();
    let tabu_tenure = 20;
    
    let mut stagnation = 0;
    
    for _ in 0..20000 {
        let mut new_grid = grid.clone();
        new_grid.mutate_directed(rng);
        
        // Check memory
        let is_tabu = tabu_list.iter().any(|g| g == &new_grid);
        
        let new_score = new_grid.fitness();
        
        let diff = (new_score - current_score) as f32;
        
        // Aspiration: if it's the best ever, ignore tabu
        let accept = if new_score > best_score {
            true
        } else if is_tabu {
            false
        } else {
            diff > 0.0 || rng.gen_float() < (diff / temp).exp()
        };
        
        if accept {
            *grid = new_grid.clone();
            current_score = new_score;
            
            tabu_list.push(grid.clone());
            if tabu_list.len() > tabu_tenure {
                tabu_list.remove(0);
            }
            
            if current_score > best_score {
                best_score = current_score;
                best_grid = grid.clone();
                stagnation = 0;
            } else {
                stagnation += 1;
            }
        } else {
            stagnation += 1;
        }
        
        if stagnation > 500 {
            *grid = best_grid.clone();
            current_score = best_score;
            temp = initial_temp / 2.0;
            stagnation = 0;
            tabu_list.clear();
        }
        
        temp *= cooling_rate;
        if temp < 0.01 {
            temp = 0.01;
        }
    }
    
    *grid = best_grid;
}

fn main() {
    let start = SystemTime::now();
    let since_the_epoch = start.duration_since(UNIX_EPOCH).unwrap();
    let mut rng = Rng::new(since_the_epoch.subsec_nanos());

    let mut grid = Grid::new(&mut rng);
    
    println!("SATE v3 status : Initialisation avec memoire (Tabu).");
    println!("Score de base : {}", grid.fitness());
    
    println!("Lancement de SATE v3 (Recuit Simule + Memoire Tabu)...");
    
    simulated_annealing(&mut grid, &mut rng, 100.0);
    
    println!("Score SATE v3 atteint : {}", grid.fitness());
}
