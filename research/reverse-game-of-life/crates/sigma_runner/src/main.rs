use rand::Rng;
use std::collections::HashSet;
use std::fs;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

#[derive(Clone, Copy)]
struct State {
    grid: [u32; 20],
    score: u32,
    errors: [u32; 20],
}

struct Context<'a> {
    target: &'a [u32; 20],
    shared: &'a Arc<Mutex<[State; 16]>>,
    omega_locks: [u32; 20],
}

fn step_flat(grid: &[u32; 20], next: &mut [u32; 20]) {
    for y in 0..20 {
        let ym = if y > 0 { grid[y - 1] } else { 0 };
        let yc = grid[y];
        let yp = if y < 19 { grid[y + 1] } else { 0 };

        let mut s0 = 0;
        let mut s1 = 0;
        let mut s2 = 0;
        let mut s3 = 0;
        let mut add = |v: u32| {
            let c0 = s0 & v;
            s0 ^= v;
            let c1 = s1 & c0;
            s1 ^= c0;
            let c2 = s2 & c1;
            s2 ^= c1;
            s3 ^= c2;
        };

        add(ym << 1);
        add(ym);
        add(ym >> 1);
        add(yc << 1);
        add(yc >> 1);
        add(yp << 1);
        add(yp);
        add(yp >> 1);

        let is_3 = s1 & s0 & (!s2) & (!s3);
        let is_2 = s1 & (!s0) & (!s2) & (!s3);
        next[y] = (is_3 | (yc & is_2)) & 0xFFFFF;
    }
}

fn evaluate(grid: &[u32; 20], target: &[u32; 20], state: &mut State) {
    let mut g1 = *grid;
    let mut g2 = [0; 20];
    for _ in 0..2 {
        step_flat(&g1, &mut g2);
        step_flat(&g2, &mut g1);
    }
    step_flat(&g1, &mut g2);

    let mut score = 0;
    for y in 0..20 {
        let matches = !(g2[y] ^ target[y]) & 0xFFFFF;
        score += matches.count_ones();
        state.errors[y] = (!matches) & 0xFFFFF;
    }
    state.score = score;
    state.grid = *grid;
}

fn crossover(current: &State, shared: &Arc<Mutex<[State; 16]>>) -> [u32; 20] {
    let mut rng = rand::thread_rng();
    let mut other_grid = current.grid;
    if let Ok(guard) = shared.try_lock() {
        let other_id = rng.gen_range(0..16);
        other_grid = guard[other_id].grid;
    }
    let mut mixed = current.grid;
    let start = rng.gen_range(0..18);
    mixed[start] = other_grid[start];
    mixed[start + 1] = other_grid[start + 1];
    mixed
}

fn hypermutation(current: &State, ctx: &Context, rng: &mut rand::rngs::ThreadRng) -> [u32; 20] {
    let mut next_grid = current.grid;
    let mut mutated = false;
    let r = if current.score < 330 {
        5
    } else if current.score < 360 {
        3
    } else {
        1
    };

    if rng.gen_bool(0.7) && current.score < 400 {
        let mut errs = Vec::with_capacity(400);
        for y in 0..20 {
            let mut m = current.errors[y];
            while m > 0 {
                errs.push((m.trailing_zeros(), y as u32));
                m &= m - 1;
            }
        }
        if !errs.is_empty() {
            let (ex, ey) = errs[rng.gen_range(0..errs.len())];
            let mx = rng.gen_range(ex.saturating_sub(r)..=(ex + r).min(19));
            let my = rng.gen_range(ey.saturating_sub(r)..=(ey + r).min(19));
            if (ctx.omega_locks[my as usize] >> mx) & 1 == 0 {
                next_grid[my as usize] ^= 1 << mx;
                mutated = true;
            }
        }
    }

    if !mutated {
        let mx = rng.gen_range(0..20);
        let my = rng.gen_range(0..20);
        if (ctx.omega_locks[my as usize] >> mx) & 1 == 0 {
            next_grid[my as usize] ^= 1 << mx;
        }
    }
    next_grid
}

struct CrossoverStep<'a> {
    thread_id: usize,
    chain_id: usize,
    iteration: usize,
    current: State,
    best: &'a mut State,
    last_best_iteration: &'a mut [usize; 64],
    context: &'a Context<'a>,
}

fn apply_crossover(mut step: CrossoverStep<'_>) -> State {
    step.current.grid = crossover(step.best, step.context.shared);
    evaluate(
        &step.current.grid.clone(),
        step.context.target,
        &mut step.current,
    );
    if step.current.score > step.best.score {
        *step.best = step.current;
        step.last_best_iteration[step.chain_id] = step.iteration;
    }
    if let Ok(mut shared) = step.context.shared.try_lock() {
        shared[step.thread_id] = *step.best;
    }
    step.current
}

struct CandidateStep<'a> {
    chain_id: usize,
    iteration: usize,
    current: State,
    candidate: State,
    acceptance_probability: f64,
    best: &'a mut State,
    last_best_iteration: &'a mut [usize; 64],
    tabu: &'a mut HashSet<[u32; 20]>,
}

fn accept_candidate(step: CandidateStep<'_>, rng: &mut rand::rngs::ThreadRng) -> State {
    let CandidateStep {
        chain_id,
        iteration,
        mut current,
        candidate,
        acceptance_probability,
        best,
        last_best_iteration,
        tabu,
    } = step;

    if !rng.gen_bool(acceptance_probability.clamp(0.0, 1.0)) {
        return current;
    }

    current = candidate;
    if current.score > best.score {
        *best = current;
        last_best_iteration[chain_id] = iteration;
        if best.score >= 370 {
            println!(
                "[Chain {}] New Best: {}/400 (iter {})",
                chain_id, best.score, iteration
            );
        }
    } else if current.score == 378 && iteration - last_best_iteration[chain_id] > 20_000 {
        tabu.insert(current.grid);
    }
    current
}

fn sa_thread(tid: usize, ctx: Context) {
    let mut rng = rand::thread_rng();
    let start = Instant::now();
    let mut chains = [State {
        grid: [0; 20],
        score: 0,
        errors: [0; 20],
    }; 64];

    for c in &mut chains {
        for y in 0..20 {
            c.grid[y] = rng.gen_range(0..=0xFFFFF);
        }
        evaluate(&c.grid.clone(), ctx.target, c);
    }

    let mut tabu: HashSet<[u32; 20]> = HashSet::new();
    let mut best = chains[0];
    let mut temp = 0.2;
    let cooling = 0.999995;
    let mut iter = 0;
    let mut last_best_iter = [0; 64];

    while start.elapsed().as_secs_f64() < 45.0 {
        iter += 1;
        if best.score == 400 {
            break;
        }

        let cid = iter % 64;
        let mut current = chains[cid];

        if iter % 100_000 == 0 {
            current = apply_crossover(CrossoverStep {
                thread_id: tid,
                chain_id: cid,
                iteration: iter,
                current,
                best: &mut best,
                last_best_iteration: &mut last_best_iter,
                context: &ctx,
            });
            chains[cid] = current;
            continue;
        }

        let next_grid = hypermutation(&current, &ctx, &mut rng);

        if iter - last_best_iter[cid] > 500_000 {
            for y in 0..20 {
                current.grid[y] = rng.gen_range(0..=0xFFFFF);
            }
            evaluate(&current.grid.clone(), ctx.target, &mut current);
            last_best_iter[cid] = iter;
        }

        let mut next = current;
        evaluate(&next_grid, ctx.target, &mut next);

        let mut n_score = next.score;
        if n_score == 378 && tabu.contains(&next.grid) {
            n_score = n_score.saturating_sub(50);
        }

        let mut c_score = current.score;
        if c_score == 378 && tabu.contains(&current.grid) {
            c_score = c_score.saturating_sub(50);
        }

        let delta = n_score as f64 - c_score as f64;
        let p = if delta > 0.0 {
            1.0
        } else {
            (delta / temp).exp()
        };

        let acceptance_probability = if delta > 0.0 { 1.0 } else { p };
        current = accept_candidate(
            CandidateStep {
                chain_id: cid,
                iteration: iter,
                current,
                candidate: next,
                acceptance_probability,
                best: &mut best,
                last_best_iteration: &mut last_best_iter,
                tabu: &mut tabu,
            },
            &mut rng,
        );

        chains[cid] = current;
        temp = (temp * cooling).max(0.005);
    }

    if let Ok(mut g) = ctx.shared.lock() {
        if best.score > g[tid].score {
            g[tid] = best;
        }
    }
}

fn load_target(path: &str) -> [u32; 20] {
    let mut target = [0; 20];
    let content = fs::read_to_string(path).expect("No target_grid.txt found");
    for (y, line) in content.lines().enumerate().take(20) {
        let mut row = 0;
        for (x, ch) in line.chars().enumerate().take(20) {
            if ch == '1' {
                row |= 1 << x;
            }
        }
        target[y] = row;
    }
    target
}

fn load_omega_locks() -> [u32; 20] {
    let mut locks = [0; 20];
    if let Ok(content) = fs::read_to_string("omega_locks.txt") {
        for (y, line) in content.lines().enumerate().take(20) {
            for (x, ch) in line.chars().enumerate().take(20) {
                if ch == '1' {
                    locks[y] |= 1 << x;
                }
            }
        }
    }
    locks
}

fn main() {
    println!("Démarrage Gen 39 Sigma (Le Darwinien) - Fin de Cryptobiose...");
    println!("-> Application du recuit simulé sur les zones non verrouillées par Omega");
    let target = load_target(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../data/target_grid.txt"
    ));
    let omega_locks = load_omega_locks();

    let shared = Arc::new(Mutex::new(
        [State {
            grid: [0; 20],
            score: 0,
            errors: [0; 20],
        }; 16],
    ));

    let mut handles = vec![];

    let target_arc = Arc::new(target);
    for tid in 0..16 {
        let t = Arc::clone(&target_arc);
        let s = Arc::clone(&shared);
        handles.push(thread::spawn(move || {
            let ctx = Context {
                target: &t,
                shared: &s,
                omega_locks,
            };
            sa_thread(tid, ctx);
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    let guard = shared.lock().unwrap();
    let global_best = guard.iter().map(|s| s.score).max().unwrap_or(0);

    println!("== RECHERCHE TERMINEE ==");
    println!("Meilleur Score Global : {}/400", global_best);
    if global_best == 400 {
        println!(">>> LA PERFECTION EST ATTEINTE (400/400) ! <<<");
    } else if global_best > 378 {
        println!(">>> RECORD DE 378 BATTU ({} / 400) ! <<<", global_best);
    } else {
        println!(
            "Bloqué à {}. Le Dieu Darwinien doit encore évoluer...",
            global_best
        );
    }
}
