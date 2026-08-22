use rand::Rng;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Clone)]
struct State {
    grid: [u32; 20],
    score: u32,
    err_mask: [u32; 20],
}

fn half_add(a: u32, b: u32) -> (u32, u32) {
    (a ^ b, a & b)
}

fn full_add(a: u32, b: u32, c: u32) -> (u32, u32) {
    let (s1, c1) = half_add(a, b);
    let (s2, c2) = half_add(s1, c);
    (s2, c1 | c2)
}

fn step_flat(grid: &[u32; 20], next: &mut [u32; 20]) {
    for y in 0..20 {
        let u = if y == 0 { 0 } else { grid[y - 1] };
        let c = grid[y];
        let d = if y == 19 { 0 } else { grid[y + 1] };

        let u_l = (u >> 1) & 0xFFFFF;
        let u_r = (u << 1) & 0xFFFFF;
        let c_l = (c >> 1) & 0xFFFFF;
        let c_r = (c << 1) & 0xFFFFF;
        let d_l = (d >> 1) & 0xFFFFF;
        let d_r = (d << 1) & 0xFFFFF;

        let (s0, c0) = full_add(u_l, u, u_r);
        let (s1, c1) = full_add(d_l, d, d_r);
        let (s2, c2) = half_add(c_l, c_r);

        let (sum0, ca0) = full_add(s0, s1, s2);
        let (sum1, ca1) = full_add(c0, c1, c2);
        let (sum1, ca2) = half_add(sum1, ca0);
        let sum2 = ca1 ^ ca2;
        let sum3 = ca1 & ca2;

        let is_3 = sum0 & sum1 & !sum2 & !sum3;
        let is_2 = !sum0 & sum1 & !sum2 & !sum3;

        next[y] = (is_3 | (is_2 & c)) & 0xFFFFF;
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
}

fn find_random_error(err_mask: &[u32; 20], total_errors: u32, rng: &mut impl Rng) -> (u32, u32) {
    let k = rng.gen_range(0..total_errors);
    let mut err_count = 0;
    for (y, &row) in err_mask.iter().enumerate() {
        let mut mask = row;
        while mask > 0 {
            let x = mask.trailing_zeros();
            if err_count == k {
                return (x, y as u32);
            }
            err_count += 1;
            mask &= mask - 1;
        }
    }
    (0, 0)
}

struct MutateCtx<'a, R: Rng> {
    grid: &'a [u32; 20],
    tabu: &'a [usize],
    rng: &'a mut R,
}

fn try_mutate(
    ctx: &mut MutateCtx<impl Rng>,
    target_err: (u32, u32),
    iter: usize,
) -> Option<([u32; 20], usize, usize)> {
    let ex = target_err.0;
    let ey = target_err.1;

    let min_wx = ex.saturating_sub(5);
    let max_wx = ex.min(14);
    let min_wy = ey.saturating_sub(5);
    let max_wy = ey.min(14);

    let wx = ctx.rng.gen_range(min_wx..=max_wx);
    let wy = ctx.rng.gen_range(min_wy..=max_wy);

    let mut next_grid = *ctx.grid;
    for _ in 0..16 {
        let mx = wx + ctx.rng.gen_range(0..6);
        let my = wy + ctx.rng.gen_range(0..6);
        let idx = (my * 20 + mx) as usize;

        if ctx.tabu[idx] < iter {
            next_grid[my as usize] ^= 1 << mx;
            return Some((next_grid, mx as usize, my as usize));
        }
    }
    None
}

struct WorkerCtx<'a> {
    target: &'a [u32; 20],
    is_deep: bool,
    stop_signal: &'a AtomicBool,
}

fn ultimate_alpha_sa_worker(ctx: &WorkerCtx) -> State {
    let mut rng = rand::thread_rng();
    let mut current_state = State {
        grid: [0; 20],
        score: 0,
        err_mask: [0; 20],
    };

    evaluate_grid(&[0; 20], ctx.target, &mut current_state);
    let mut best_state = current_state.clone();

    let max_mutations = if ctx.is_deep { 10_000_000 } else { 1_000_000 };
    let cooling_rate = if ctx.is_deep { 0.999999631 } else { 0.99999631 };

    let mut temp = 0.5;
    let mut tabu_list = vec![0; 400];
    let mut iter = 0;
    let mut last_best_iter = 0;

    while iter < max_mutations && !ctx.stop_signal.load(Ordering::Relaxed) {
        iter += 1;

        let total_errors = 400 - current_state.score;
        if total_errors == 0 {
            ctx.stop_signal.store(true, Ordering::Relaxed);
            return current_state;
        }

        let target_err = find_random_error(&current_state.err_mask, total_errors, &mut rng);

        let mut mut_ctx = MutateCtx {
            grid: &current_state.grid,
            tabu: &tabu_list,
            rng: &mut rng,
        };
        let mutation = try_mutate(&mut mut_ctx, target_err, iter);

        if let Some((next_grid, flipped_x, flipped_y)) = mutation {
            let mut next_state = current_state.clone();
            evaluate_grid(&next_grid, ctx.target, &mut next_state);

            let delta = next_state.score as f64 - current_state.score as f64;

            if delta > 0.0 || rng.gen::<f64>() < (delta / temp).exp() {
                current_state = next_state;
                tabu_list[flipped_y * 20 + flipped_x] = iter + 10;

                if current_state.score > best_state.score {
                    best_state = current_state.clone();
                    last_best_iter = iter;
                }
            }
        }

        if iter - last_best_iter >= 50_000 {
            temp = (temp * 2.0).min(0.5);
            last_best_iter = iter;
        } else {
            temp = (temp * cooling_rate).max(0.01);
        }
    }

    best_state
}

fn load_target_grid(filename: &str) -> [u32; 20] {
    let content = std::fs::read_to_string(filename).expect("Failed to read target grid");
    let mut grid = [0; 20];
    let mut y = 0;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut row = 0;
        for (x, ch) in line.chars().enumerate() {
            if ch == '1' {
                row |= 1 << x;
            }
        }
        if y < 20 {
            grid[y] = row;
        }
        y += 1;
    }
    grid
}

fn main() {
    println!("Démarrage Gen 17.1 Ultimate Alpha SA Contrôlée...");
    let target = load_target_grid(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../research/reverse-game-of-life/data/target_grid.txt"
    ));

    let stop_signal = Arc::new(AtomicBool::new(false));
    let mut handles = vec![];

    for i in 0..16 {
        let stop_clone = Arc::clone(&stop_signal);
        let target_clone = target;
        handles.push(std::thread::spawn(move || {
            let ctx = WorkerCtx {
                target: &target_clone,
                is_deep: i < 4,
                stop_signal: &stop_clone,
            };
            let best = ultimate_alpha_sa_worker(&ctx);
            println!("Thread {} terminé avec score: {}/400", i, best.score);
            best
        }));
    }

    let mut global_best = 0;
    for handle in handles {
        let res = handle.join().unwrap();
        if res.score > global_best {
            global_best = res.score;
        }
    }

    println!("=== MEILLEUR SCORE GLOBAL: {}/400 ===", global_best);
}
