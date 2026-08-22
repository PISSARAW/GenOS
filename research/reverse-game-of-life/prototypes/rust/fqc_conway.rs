use std::time::Instant;

const SIZE: usize = 5;
const AREA: usize = SIZE * SIZE;

// Règle 2 : Max 3 paramètres
fn get_idx(x: usize, y: usize) -> usize {
    y * SIZE + x
}

// Règle 2 : Max 3 paramètres
fn count_neighbors(grid: &[u8; AREA], x: usize, y: usize) -> u8 {
    let mut count = 0;
    // Règle 3 : Complexité faible (évite l'imbrication excessive)
    let x_min = if x > 0 { x - 1 } else { 0 };
    let x_max = if x < SIZE - 1 { x + 1 } else { x };
    let y_min = if y > 0 { y - 1 } else { 0 };
    let y_max = if y < SIZE - 1 { y + 1 } else { y };

    for iy in y_min..=y_max {
        for ix in x_min..=x_max {
            if ix != x || iy != y {
                count += grid[get_idx(ix, iy)];
            }
        }
    }
    count
}

// Règle 2 : Max 3 paramètres
fn apply_rules(alive: bool, neighbors: u8) -> u8 {
    if alive && (neighbors == 2 || neighbors == 3) {
        1
    } else if !alive && neighbors == 3 {
        1
    } else {
        0
    }
}

// Règle 2 : Max 3 paramètres
fn next_gen(grid: &[u8; AREA]) -> [u8; AREA] {
    let mut new_grid = [0; AREA];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let n = count_neighbors(grid, x, y);
            let idx = get_idx(x, y);
            let alive = grid[idx] == 1;
            
            new_grid[idx] = apply_rules(alive, n);
        }
    }
    new_grid
}

// Règle 2 : Max 3 paramètres
fn evaluate_grid(mut grid: [u8; AREA], steps: u32, start: Instant) -> Result<u32, ()> {
    for _ in 0..steps {
        // Condition d'arrêt stricte (Time-Out déterministe)
        if start.elapsed().as_millis() > 50 {
            return Err(());
        }
        grid = next_gen(&grid);
    }
    Ok(grid.iter().map(|&c| c as u32).sum())
}

fn main() {
    let start_time = Instant::now();
    let limit = 3; // Limite d'itérations imposée
    let steps = 500_000; // Volontairement élevé pour forcer le time-out
    
    println!("Démarrage FQC (Fluctuation Quantique Cellulaire) sur Conway");
    
    let initial_grid = [
        0,1,0,0,0,
        0,0,1,0,0,
        1,1,1,0,0,
        0,0,0,0,0,
        0,0,0,0,0,
    ];
    
    for i in 1..=limit {
        println!("Itération {}/{}...", i, limit);
        match evaluate_grid(initial_grid, steps, start_time) {
            Ok(score) => println!("Score = {}", score),
            Err(_) => {
                println!("TIMEOUT_EXCEEDED");
                println!("Stagnation détectée à l'itération {}", i);
                return;
            }
        }
    }
    println!("SUCCESS");
}
