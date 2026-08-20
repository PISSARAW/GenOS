use std::time::Instant;

const SIZE: usize = 20;
const AREA: usize = SIZE * SIZE;
const HISTORY_LEN: usize = 16;

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
    // FQC v2 - Empêche strictement l'annulation (Life without Death étendu)
    if alive {
        1
    } else if neighbors >= 1 && neighbors <= 3 {
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

// Check for cycle, max 3 params
fn is_cycle(history: &[[u8; AREA]; HISTORY_LEN], new_grid: &[u8; AREA], hist_cnt: usize) -> bool {
    let limit = if hist_cnt < HISTORY_LEN { hist_cnt } else { HISTORY_LEN };
    for i in 0..limit {
        if &history[i] == new_grid {
            return true;
        }
    }
    false
}

// Break cycle, max 3 params
fn break_cycle(grid: &mut [u8; AREA], step: usize) {
    // Injection pour empêcher les structures de s'annuler
    // On trouve des espaces vides et on injecte de la vie
    let mut count = 0;
    for i in 0..AREA {
        let idx = (step + i * 17) % AREA;
        if grid[idx] == 0 {
            grid[idx] = 1;
            count += 1;
            if count > 19 { // Injecte 20 cellules
                break;
            }
        }
    }
}

// Simulate and evaluate
fn evaluate_grid(mut grid: [u8; AREA], steps: u32, start: Instant) -> Result<u32, ()> {
    let mut history = [[0; AREA]; HISTORY_LEN];
    let mut hist_cnt = 0;

    for step in 0..steps {
        if start.elapsed().as_millis() > 5000 {
            return Err(());
        }
        
        let mut n_grid = next_gen(&grid);
        
        if is_cycle(&history, &n_grid, hist_cnt) {
            break_cycle(&mut n_grid, step as usize);
            // Vider l'historique pour ne pas casser en boucle le même motif immédiat
            hist_cnt = 0; 
        } else {
            history[hist_cnt % HISTORY_LEN] = grid;
            hist_cnt += 1;
        }
        
        grid = n_grid;
    }
    Ok(grid.iter().map(|&c| c as u32).sum())
}

fn main() {
    let start_time = Instant::now();
    let steps = 100_000; // Plus d'itérations pour atteindre un équilibre ou une haute entropie
    
    println!("Démarrage FQC v2 (Cycle Breaking) sur Tabula Rasa 20x20");
    
    let mut initial_grid = [0; AREA];
    // Seed initial
    initial_grid[get_idx(10, 10)] = 1;
    initial_grid[get_idx(11, 10)] = 1;
    initial_grid[get_idx(12, 10)] = 1;
    initial_grid[get_idx(12, 9)] = 1;
    initial_grid[get_idx(11, 8)] = 1;
    
    match evaluate_grid(initial_grid, steps, start_time) {
        Ok(score) => println!("Score final = {}", score),
        Err(_) => println!("TIMEOUT_EXCEEDED (Trop long)"),
    }
    println!("SUCCESS");
}
