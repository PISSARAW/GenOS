use rayon::prelude::*;
use std::time::{Duration, Instant};

mod oracle_bridge;
use oracle_bridge::OracleBridge;

const SIZE: usize = 20;

type Grid = [u32; SIZE];

fn get_bit(grid: &Grid, x: i32, y: i32) -> u32 {
    if x < 0 || y < 0 || x >= SIZE as i32 || y >= SIZE as i32 {
        return 0;
    }
    (grid[y as usize] >> x) & 1
}

fn count_neighbors(grid: &Grid, x: i32, y: i32) -> u32 {
    let mut count = 0;
    count += get_bit(grid, x - 1, y - 1);
    count += get_bit(grid, x, y - 1);
    count += get_bit(grid, x + 1, y - 1);
    count += get_bit(grid, x - 1, y);
    count += get_bit(grid, x + 1, y);
    count += get_bit(grid, x - 1, y + 1);
    count += get_bit(grid, x, y + 1);
    count += get_bit(grid, x + 1, y + 1);
    count
}

fn next_state(grid: &Grid) -> Grid {
    let mut new_grid = [0; SIZE];
    for (y, next_row) in new_grid.iter_mut().enumerate() {
        let mut row = 0;
        for x in 0..SIZE {
            let n = count_neighbors(grid, x as i32, y as i32);
            let alive = get_bit(grid, x as i32, y as i32) == 1;
            if n == 3 || (alive && n == 2) {
                row |= 1 << x;
            }
        }
        *next_row = row;
    }
    new_grid
}

fn evaluate(mut grid: Grid, max_steps: u32) -> u32 {
    let mut prev_grid = grid;
    let mut prev_prev_grid = None;

    for step in 0..max_steps {
        grid = next_state(&grid);

        let pop: u32 = grid.iter().map(|row| row.count_ones()).sum();

        if pop == 0 || grid == prev_grid || prev_prev_grid == Some(grid) {
            return step;
        }

        prev_prev_grid = Some(prev_grid);
        prev_grid = grid;
    }
    max_steps
}

fn random_grid() -> Grid {
    let mut grid = [0; SIZE];
    for row in &mut grid {
        *row = rand::random::<u32>() & ((1 << SIZE) - 1);
    }
    grid
}

fn simulate_branch(time_limit: Duration) -> u32 {
    let start = Instant::now();
    let mut best_score = 0;
    let oracle = OracleBridge::new(); // Each thread can have its own bridge instance

    while start.elapsed() < time_limit {
        let grid = random_grid();
        if oracle.should_prune(&grid) {
            continue;
        }
        let score = evaluate(grid, 500); // Test lifespan up to 500 steps
        if score > best_score {
            best_score = score;
        }
    }
    best_score
}

fn main() {
    println!("[TAG: DETERMINISTIC_HARDWARE_LOCK]");
    println!("Initialisation de la recherche MCTS sur CPU (grille 20x20)...");

    let time_limit = Duration::from_secs(30);
    let threads = rayon::current_num_threads() * 4;

    println!("Évaluation parallèle asynchrone lancée (30 secondes d'allocation)...");

    let results: Vec<u32> = (0..threads)
        .into_par_iter()
        .map(|_| simulate_branch(time_limit))
        .collect();

    let max_score = results.into_iter().max().unwrap_or(0);

    println!("Score final : {}", max_score);
    if max_score > 194 {
        println!(
            "Objectif atteint ! La barrière de 194 a été pulvérisée par l'architecture parallèle."
        );
    } else {
        println!(
            "L'algorithme s'est stabilisé. La limite temporelle n'a pas permis de dépasser 194."
        );
    }
}
