use std::sync::{Arc, Mutex};
use rand::Rng;
use std::thread;

#[derive(Clone, Copy)]
struct SingleUniverse {
    grid: [u32; 20],
    score: u32,
}

#[derive(Clone, Copy)]
struct Batch64 {
    cells: [u64; 400],
}

impl Batch64 {
    fn new() -> Self {
        Batch64 { cells: [0; 400] }
    }

    fn extract_universe(&self, index: usize) -> [u32; 20] {
        let mut grid = [0; 20];
        for y in 0..20 {
            let mut row = 0;
            for x in 0..20 {
                let bit = (self.cells[y * 20 + x] >> index) & 1;
                row |= (bit as u32) << x;
            }
            grid[y] = row;
        }
        grid
    }
}

#[derive(Clone, Copy)]
struct BatchEvalResult {
    scores: [u32; 64],
    errors: [[u32; 20]; 64],
}

impl BatchEvalResult {
    fn new() -> Self {
        BatchEvalResult {
            scores: [0; 64],
            errors: [[0; 20]; 64],
        }
    }
}

fn count_neighbors(batch: &Batch64, x: usize, y: usize) -> (u64, u64, u64) {
    let mut count0 = 0u64;
    let mut count1 = 0u64;
    let mut count2 = 0u64;
    for dy in -1..=1 {
        for dx in -1..=1 {
            if dy == 0 && dx == 0 { continue; }
            let ny = y as isize + dy;
            let nx = x as isize + dx;
            if ny >= 0 && ny < 20 && nx >= 0 && nx < 20 {
                let c = batch.cells[ny as usize * 20 + nx as usize];
                let carry1 = count0 & c;
                count0 ^= c;
                let carry2 = count1 & carry1;
                count1 ^= carry1;
                count2 |= carry2;
            }
        }
    }
    (count0, count1, count2)
}

fn step_64_batch(batch: &Batch64, next: &mut Batch64) {
    for y in 0..20 {
        for x in 0..20 {
            let (c0, c1, c2) = count_neighbors(batch, x, y);
            let c = batch.cells[y * 20 + x];
            next.cells[y * 20 + x] = (!c2 & c1) & (c | c0);
        }
    }
}

fn evaluate_batch64(grids: &Batch64, target: &[u32; 20], res: &mut BatchEvalResult) {
    let mut b1 = *grids;
    let mut b2 = Batch64::new();
    for _ in 0..5 {
        step_64_batch(&b1, &mut b2);
        b1 = b2;
    }
    
    for i in 0..64 {
        res.scores[i] = 0;
        res.errors[i] = [0; 20];
    }
    
    for y in 0..20 {
        let ty = target[y];
        for x in 0..20 {
            let t_bit = (ty >> x) & 1;
            let cells = b1.cells[y * 20 + x];
            let matches = if t_bit == 1 { cells } else { !cells };
            
            let mut m = matches;
            while m > 0 {
                let i = m.trailing_zeros() as usize;
                res.scores[i] += 1;
                m &= m - 1;
            }
            
            let mut e = !matches;
            while e > 0 {
                let i = e.trailing_zeros() as usize;
                res.errors[i][y] |= 1 << x;
                e &= e - 1;
            }
        }
    }
}

fn find_error(k: u32, errors: &[u32; 20]) -> (usize, usize) {
    let mut err_count = 0;
    for y in 0..20 {
        let mut mask = errors[y];
        while mask > 0 {
            let x = mask.trailing_zeros();
            if err_count == k {
                return (x as usize, y);
            }
            err_count += 1;
            mask &= mask - 1;
        }
    }
    (0, 0)
}

fn random_neighbor(ex: usize, ey: usize, rng: &mut rand::rngs::ThreadRng) -> (usize, usize) {
    let xmin = ex.saturating_sub(5);
    let xmax = (ex + 5).min(19);
    let ymin = ey.saturating_sub(5);
    let ymax = (ey + 5).min(19);
    let mx = rng.gen_range(xmin..=xmax);
    let my = rng.gen_range(ymin..=ymax);
    (mx, my)
}

fn mutate_batch(current: &Batch64, res: &BatchEvalResult, rng: &mut rand::rngs::ThreadRng) -> Batch64 {
    let mut next = *current;
    for i in 0..64 {
        let score = res.scores[i];
        if rng.gen::<f64>() < 0.70 && score < 400 {
            let total_errors = 400 - score;
            let k = rng.gen_range(0..total_errors);
            let target_err = find_error(k, &res.errors[i]);
            let (mx, my) = random_neighbor(target_err.0, target_err.1, rng);
            next.cells[my * 20 + mx] ^= 1 << i;
        } else {
            let mx = rng.gen_range(0..20);
            let my = rng.gen_range(0..20);
            next.cells[my * 20 + mx] ^= 1 << i;
        }
    }
    next
}

fn apply_masks(dst: &mut Batch64, src: &Batch64, mask: u64) {
    if mask == 0 { return; }
    for i in 0..400 {
        dst.cells[i] = (dst.cells[i] & !mask) | (src.cells[i] & mask);
    }
}

struct SAContext<'a> {
    cur: &'a mut BatchEvalResult,
    nxt: &'a BatchEvalResult,
    best_scores: &'a mut [u32; 64],
}

fn check_acceptance(ctx: SAContext, temp: f64, rng: &mut rand::rngs::ThreadRng) -> (u64, u64) {
    let mut accept = 0u64;
    let mut new_best = 0u64;
    for i in 0..64 {
        let delta = ctx.nxt.scores[i] as f64 - ctx.cur.scores[i] as f64;
        if delta > 0.0 || rng.gen::<f64>() < (delta / temp).exp() {
            accept |= 1 << i;
            ctx.cur.scores[i] = ctx.nxt.scores[i];
            ctx.cur.errors[i] = ctx.nxt.errors[i];
            if ctx.cur.scores[i] > ctx.best_scores[i] {
                ctx.best_scores[i] = ctx.cur.scores[i];
                new_best |= 1 << i;
            }
        }
    }
    (accept, new_best)
}

fn init_random_batch(batch: &mut Batch64, rng: &mut rand::rngs::ThreadRng) {
    for i in 0..64 {
        for y in 0..20 {
            let row: u32 = rng.gen_range(0..=0xFFFFF);
            for x in 0..20 {
                if (row >> x) & 1 == 1 {
                    batch.cells[y * 20 + x] |= 1 << i;
                }
            }
        }
    }
}

fn sa_thread_64(target: Arc<[u32; 20]>) -> SingleUniverse {
    let mut rng = rand::thread_rng();
    let mut current = Batch64::new();
    init_random_batch(&mut current, &mut rng);
    
    let mut cur_res = BatchEvalResult::new();
    evaluate_batch64(&current, &target, &mut cur_res);
    
    let mut best = current;
    let mut best_scores = cur_res.scores;
    let mut temp = 0.5;
    let cooling_rate = 0.99999;
    let iterations = 1_000_000;
    
    for _iter in 0..iterations {
        let next = mutate_batch(&current, &cur_res, &mut rng);
        let mut next_res = BatchEvalResult::new();
        evaluate_batch64(&next, &target, &mut next_res);
        
        let ctx = SAContext {
            cur: &mut cur_res,
            nxt: &next_res,
            best_scores: &mut best_scores,
        };
        let (accept_mask, new_best_mask) = check_acceptance(ctx, temp, &mut rng);
        
        apply_masks(&mut current, &next, accept_mask);
        apply_masks(&mut best, &current, new_best_mask);
        
        temp *= cooling_rate;
    }
    
    let best_idx = best_scores.iter().enumerate().max_by_key(|&(_, s)| s).unwrap().0;
    SingleUniverse {
        grid: best.extract_universe(best_idx),
        score: best_scores[best_idx],
    }
}

fn load_target_grid() -> [u32; 20] {
    let content = std::fs::read_to_string("target_grid.txt").unwrap();
    let mut grid = [0; 20];
    for (y, line) in content.lines().enumerate().take(20) {
        let mut row = 0;
        for (x, ch) in line.chars().enumerate().take(20) {
            if ch == '1' {
                row |= 1 << x;
            }
        }
        grid[y] = row;
    }
    grid
}

fn main() {
    let target = Arc::new(load_target_grid());
    let best_score = Arc::new(Mutex::new(0));
    
    println!("Démarrage Gen 38.1 True 64-way Memetic SA (16 threads * 64 voies = 1024 chaînes)...");
    
    let mut handles = vec![];
    for i in 0..16 {
        let t = target.clone();
        let bs = best_score.clone();
        handles.push(thread::spawn(move || {
            let result = sa_thread_64(t);
            let mut best = bs.lock().unwrap();
            if result.score > *best {
                *best = result.score;
                println!("Nouveau Record (Thread {}): {}/400", i, result.score);
            }
        }));
    }
    
    for h in handles {
        h.join().unwrap();
    }
    
    println!("Meilleur score final: {}/400", *best_score.lock().unwrap());
}
