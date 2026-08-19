use rand::Rng;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

#[derive(Clone)]
struct State {
    grid: [u32; 20],
    score: u32,
    err_mask: [u32; 20],
}

struct SaCtx<'a> {
    target: &'a [u32; 20],
    stop: &'a AtomicBool,
    global_best: &'a AtomicUsize,
}

struct WorkerConfig {
    id: usize,
    deep: bool,
}

fn add3(a: u32, b: u32, c: u32) -> (u32, u32) {
    let s0 = a ^ b ^ c;
    let s1 = (a & b) | (a & c) | (b & c);
    (s0, s1)
}

fn add2_2(a: (u32, u32), b: (u32, u32)) -> (u32, u32, u32) {
    let s0 = a.0 ^ b.0;
    let c0 = a.0 & b.0;
    let s1 = a.1 ^ b.1 ^ c0;
    let s2 = (a.1 & b.1) | (c0 & (a.1 ^ b.1));
    (s0, s1, s2)
}

fn step_flat(grid: &[u32; 20], next: &mut [u32; 20]) {
    for y in 0..20 {
        let u = grid[(y + 19) % 20];
        let c = grid[y];
        let d = grid[(y + 1) % 20];
        
        let l_u = ((u >> 1) | (u << 19)) & 0xFFFFF;
        let r_u = ((u << 1) | (u >> 19)) & 0xFFFFF;
        let (u0, u1) = add3(l_u, u, r_u);
        
        let l_c = ((c >> 1) | (c << 19)) & 0xFFFFF;
        let r_c = ((c << 1) | (c >> 19)) & 0xFFFFF;
        let (c0, c1) = add3(l_c, 0, r_c);
        
        let l_d = ((d >> 1) | (d << 19)) & 0xFFFFF;
        let r_d = ((d << 1) | (d >> 19)) & 0xFFFFF;
        let (d0, d1) = add3(l_d, d, r_d);
        
        let (ud0, ud1, ud2) = add2_2((u0, u1), (d0, d1));
        let (s0, s1, s2) = add2_2((ud0, ud1), (c0, c1));
        let s3 = ud2 | s2;
        
        let sum_is_3 = s0 & s1 & !s2 & !s3;
        let sum_is_2 = !s0 & s1 & !s2 & !s3;
        
        next[y] = (sum_is_3 | (c & sum_is_2)) & 0xFFFFF;
    }
}

fn evaluate_grid(grid: &[u32; 20], target: &[u32; 20], state: &mut State) {
    let mut g1 = *grid;
    let mut g2 = [0; 20];
    
    step_flat(&g1, &mut g2);
    step_flat(&g2, &mut g1);
    step_flat(&g1, &mut g2);
    step_flat(&g2, &mut g1);
    step_flat(&g1, &mut g2);

    let mut new_score = 0;
    let mut new_err_mask = [0; 20];
    for y in 0..20 {
        let matches = !(g2[y] ^ target[y]) & 0xFFFFF;
        new_score += matches.count_ones();
        new_err_mask[y] = !matches & 0xFFFFF;
    }
    state.score = new_score;
    state.err_mask = new_err_mask;
    state.grid = *grid;
}

fn pick_chaotic(tabu: &[usize], iter: usize) -> (usize, usize, bool) {
    let mut rng = rand::thread_rng();
    for _ in 0..16 {
        let mx = rng.gen_range(0..20);
        let my = rng.gen_range(0..20);
        if tabu[my * 20 + mx] < iter {
            return (mx, my, true);
        }
    }
    (0, 0, false)
}

fn find_kth_error(state: &State, k: u32) -> (usize, usize) {
    let mut err_count = 0;
    for y in 0..20 {
        let mut mask = state.err_mask[y];
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

fn pick_causal(state: &State, tabu: &[usize], iter: usize) -> (usize, usize, bool) {
    let mut rng = rand::thread_rng();
    let total_err = 400 - state.score;
    let k = rng.gen_range(0..total_err);
    
    let (ex, ey) = find_kth_error(state, k);
    
    let min_wx = ex.saturating_sub(5);
    let max_wx = ex.min(14);
    let min_wy = ey.saturating_sub(5);
    let max_wy = ey.min(14);
    
    let wx = rng.gen_range(min_wx..=max_wx);
    let wy = rng.gen_range(min_wy..=max_wy);
    
    for _ in 0..16 {
        let mx = wx + rng.gen_range(0..6);
        let my = wy + rng.gen_range(0..6);
        if tabu[my * 20 + mx] < iter {
            return (mx, my, true);
        }
    }
    (0, 0, false)
}

fn pick_mutation(state: &State, tabu: &[usize], iter: usize) -> (usize, usize, bool) {
    let mut rng = rand::thread_rng();
    if rng.gen::<f64>() < 0.70 {
        pick_causal(state, tabu, iter)
    } else {
        pick_chaotic(tabu, iter)
    }
}

fn update_global_best(ctx: &SaCtx, id: usize, score: u32) {
    let mut gb = ctx.global_best.load(Ordering::Relaxed);
    while (score as usize) > gb {
        if ctx.global_best.compare_exchange(gb, score as usize, Ordering::Relaxed, Ordering::Relaxed).is_ok() {
            println!("Thread {} a trouvé un nouveau record : {}/400", id, score);
            break;
        }
        gb = ctx.global_best.load(Ordering::Relaxed);
    }
}

fn update_temp(temp: f64, iter: usize, last_best: usize, cooling: f64) -> f64 {
    if iter - last_best >= 50_000 {
        (temp * 2.0).min(2.0)
    } else {
        (temp * cooling).max(0.05)
    }
}

fn ultimate_alpha_sa_worker(ctx: &SaCtx, config: &WorkerConfig) -> State {
    let mut rng = rand::thread_rng();
    let mut current_state = State { grid: [0; 20], score: 0, err_mask: [0; 20] };
    
    let mut init_grid = [0; 20];
    for y in 0..20 { init_grid[y] = rng.gen_range(0..=0xFFFFF); }
    evaluate_grid(&init_grid, ctx.target, &mut current_state);
    
    let mut best_state = current_state.clone();
    let max_mut = if config.deep { 15_000_000 } else { 3_000_000 };
    let cooling = if config.deep { 0.999999631 } else { 0.99999631 };
    
    let mut temp = 2.0;
    let mut tabu_list = vec![0; 400];
    let mut iter = 0;
    let mut last_best = 0;

    while iter < max_mut && !ctx.stop.load(Ordering::Relaxed) {
        iter += 1;
        let total_err = 400 - current_state.score;
        if total_err == 0 {
            ctx.stop.store(true, Ordering::Relaxed);
            return current_state;
        }
        
        let (x, y, flipped) = pick_mutation(&current_state, &tabu_list, iter);
        if !flipped { continue; }
        
        let mut next_grid = current_state.grid;
        next_grid[y] ^= 1 << x;
        
        let mut next_state = State { grid: [0; 20], score: 0, err_mask: [0; 20] };
        evaluate_grid(&next_grid, ctx.target, &mut next_state);
        
        let delta = next_state.score as f64 - current_state.score as f64;
        
        if delta > 0.0 || rng.gen::<f64>() < (delta / temp).exp() {
            current_state = next_state;
            tabu_list[y * 20 + x] = iter + 10;
            if current_state.score > best_state.score {
                best_state = current_state.clone();
                last_best = iter;
                update_global_best(ctx, config.id, current_state.score);
            }
        }
        
        temp = update_temp(temp, iter, last_best, cooling);
    }
    best_state
}

fn load_target(path: &str) -> [u32; 20] {
    let file = File::open(path).expect("Failed to open target grid");
    let reader = BufReader::new(file);
    let mut target = [0; 20];
    for (y, line) in reader.lines().enumerate().take(20) {
        let l = line.unwrap();
        let mut row = 0;
        for (x, ch) in l.chars().enumerate().take(20) {
            if ch == '1' {
                row |= 1 << x;
            }
        }
        target[y] = row;
    }
    target
}

fn print_grid(grid: &[u32; 20]) {
    for y in 0..20 {
        let mut line = String::new();
        for x in 0..20 {
            if (grid[y] & (1 << x)) != 0 {
                line.push('1');
            } else {
                line.push('0');
            }
        }
        println!("{}", line);
    }
}

fn main() {
    let target = load_target("../target_grid.txt");
    let stop_signal = Arc::new(AtomicBool::new(false));
    let global_best = Arc::new(AtomicUsize::new(0));
    
    let mut handles = vec![];
    
    println!("Démarrage Gen 18 Epsilon (Soupe Primordiale & Mutations Chaotiques) sur 16 threads...");
    
    for id in 0..16 {
        let t = target.clone();
        let stop = Arc::clone(&stop_signal);
        let gb = Arc::clone(&global_best);
        
        handles.push(thread::spawn(move || {
            let ctx = SaCtx { target: &t, stop: &stop, global_best: &gb };
            let cfg = WorkerConfig { id, deep: id < 8 };
            ultimate_alpha_sa_worker(&ctx, &cfg)
        }));
    }
    
    let mut best_overall = State { grid: [0; 20], score: 0, err_mask: [0; 20] };
    for h in handles {
        let res = h.join().unwrap();
        if res.score > best_overall.score {
            best_overall = res;
        }
    }
    
    println!("Meilleur score absolu : {}/400", best_overall.score);
    print_grid(&best_overall.grid);
}
