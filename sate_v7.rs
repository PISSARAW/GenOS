use std::cmp::Reverse;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const N: usize = 20;
const MASK: u32 = (1u32 << N) - 1;
const POP: usize = 28;
const ELITES: usize = 4;
type Grid = [u32; N];

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct Stats { score: i32, alive: i32, overloaded: i32 }
#[derive(Clone, Copy)]
struct Individual { g: Grid, s: Stats }

#[derive(Clone, Copy)]
struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self { Self(seed.max(1)) }
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13; x ^= x >> 7; x ^= x << 17;
        self.0 = x; x
    }
    fn usize(&mut self, n: usize) -> usize { (self.next() as usize) % n }
    fn f64(&mut self) -> f64 { (self.next() >> 11) as f64 / ((1u64 << 53) as f64) }
    fn coin(&mut self, p: f64) -> bool { self.f64() < p }
}

#[inline] fn bit(x: usize) -> u32 { 1u32 << x }
#[inline] fn get(g: &Grid, x: usize, y: usize) -> bool { g[y] & bit(x) != 0 }
#[inline] fn set(g: &mut Grid, x: usize, y: usize, v: bool) {
    if v { g[y] |= bit(x); } else { g[y] &= !bit(x); }
    g[y] &= MASK;
}
#[inline] fn flip(g: &mut Grid, x: usize, y: usize) { g[y] ^= bit(x); }
#[inline] fn hood(x: usize) -> u32 {
    let b = bit(x); (b | (b << 1) | (b >> 1)) & MASK
}
#[inline] fn neighbors(g: &Grid, x: usize, y: usize) -> u32 {
    let m = hood(x);
    let mut n = 0;
    if y > 0 { n += (g[y - 1] & m).count_ones(); }
    n += (g[y] & m).count_ones() - get(g, x, y) as u32;
    if y + 1 < N { n += (g[y + 1] & m).count_ones(); }
    n
}
fn evaluate(g: &Grid) -> Stats {
    let alive = g.iter().map(|r| (r & MASK).count_ones() as i32).sum::<i32>();
    let mut overloaded = 0;
    for y in 0..N {
        let mut row = g[y] & MASK;
        while row != 0 {
            let x = row.trailing_zeros() as usize;
            row &= row - 1;
            if neighbors(g, x, y) > 3 { overloaded += 1; }
        }
    }
    Stats { score: alive - 2 * overloaded, alive, overloaded }
}
#[inline] fn key(s: Stats) -> (i32, i32, i32) { (s.score, -s.overloaded, s.alive) }
#[inline] fn better(a: Stats, b: Stats) -> bool { key(a) > key(b) }

fn random_grid(rng: &mut Rng, density: f64) -> Grid {
    let mut g = [0u32; N];
    for y in 0..N { for x in 0..N { if rng.coin(density) { set(&mut g, x, y, true); } } }
    g
}
fn make_ind(g: Grid) -> Individual { Individual { s: evaluate(&g), g } }

fn choose_overloaded(g: &Grid, rng: &mut Rng) -> Option<(usize, usize)> {
    let start = rng.usize(N * N);
    for k in 0..N * N {
        let p = (start + k) % (N * N); let x = p % N; let y = p / N;
        if get(g, x, y) && neighbors(g, x, y) > 3 { return Some((x, y)); }
    }
    None
}
fn best_dead_sample(g: &Grid, rng: &mut Rng, samples: usize) -> Option<(usize, usize)> {
    let mut best = None::<((usize, usize), Stats)>;
    for _ in 0..samples {
        let x = rng.usize(N); let y = rng.usize(N);
        if get(g, x, y) { continue; }
        let mut c = *g; set(&mut c, x, y, true);
        let s = evaluate(&c);
        if best.map(|(_, bs)| better(s, bs)).unwrap_or(true) { best = Some(((x, y), s)); }
    }
    best.map(|(p, _)| p)
}

fn mutate(mut g: Grid, rng: &mut Rng, strength: usize) -> Grid {
    for _ in 0..strength.max(1) {
        let mode = rng.usize(100);
        if mode < 34 {
            if let Some((x, y)) = choose_overloaded(&g, rng) {
                // Remove one offender or a nearby live contributor.
                let dx = rng.usize(3) as isize - 1; let dy = rng.usize(3) as isize - 1;
                let nx = (x as isize + dx).clamp(0, (N - 1) as isize) as usize;
                let ny = (y as isize + dy).clamp(0, (N - 1) as isize) as usize;
                if get(&g, nx, ny) { set(&mut g, nx, ny, false); }
                else { set(&mut g, x, y, false); }
                continue;
            }
        }
        if mode < 68 {
            if let Some((x, y)) = best_dead_sample(&g, rng, 8) {
                set(&mut g, x, y, true);
                continue;
            }
        }
        flip(&mut g, rng.usize(N), rng.usize(N));
    }
    g
}

fn crossover(a: &Grid, b: &Grid, rng: &mut Rng) -> Grid {
    let mut c = [0u32; N];
    for y in 0..N {
        // Uniform bit-level crossover plus occasional whole-row inheritance.
        if rng.usize(10) < 3 {
            c[y] = if rng.coin(0.5) { a[y] } else { b[y] };
        } else {
            let m = (rng.next() as u32) & MASK;
            c[y] = ((a[y] & m) | (b[y] & !m)) & MASK;
        }
    }
    c
}

fn local_improve(mut ind: Individual, rng: &mut Rng, rounds: usize) -> Individual {
    for _ in 0..rounds {
        let mut best = ind;
        // Mixed 1-flip / targeted candidates.
        for k in 0..18 {
            let c = if k < 6 {
                mutate(ind.g, rng, 1)
            } else {
                let mut t = ind.g;
                flip(&mut t, rng.usize(N), rng.usize(N));
                t
            };
            let ci = make_ind(c);
            if better(ci.s, best.s) { best = ci; }
        }
        if better(best.s, ind.s) { ind = best; } else { break; }
    }
    ind
}

fn tournament(pop: &[Individual], rng: &mut Rng) -> Individual {
    let mut best = pop[rng.usize(pop.len())];
    for _ in 0..3 {
        let c = pop[rng.usize(pop.len())];
        if better(c.s, best.s) { best = c; }
    }
    best
}

fn update_global(global: &Arc<Mutex<Option<Individual>>>, cand: Individual) {
    let mut guard = global.lock().unwrap();
    if guard.map(|b| better(cand.s, b.s)).unwrap_or(true) { *guard = Some(cand); }
}

fn island(id: usize, seconds: f64, seed: u64, global: Arc<Mutex<Option<Individual>>>) -> (Individual, u64) {
    let mut rng = Rng::new(seed ^ (id as u64 + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15));
    let deadline = Instant::now() + Duration::from_secs_f64(seconds.max(0.01));

    let mut pop = Vec::<Individual>::with_capacity(POP);
    for i in 0..POP {
        let density = 0.16 + 0.30 * ((i as f64 + rng.f64()) / POP as f64);
        let ind = local_improve(make_ind(random_grid(&mut rng, density)), &mut rng, 6);
        pop.push(ind);
    }
    pop.sort_by_key(|i| Reverse(key(i.s)));
    let mut local_best = pop[0];
    update_global(&global, local_best);

    let mut generations = 0u64;
    let mut stale = 0u64;
    while Instant::now() < deadline {
        generations += 1; stale += 1;
        pop.sort_by_key(|i| Reverse(key(i.s)));

        let mut next = Vec::<Individual>::with_capacity(POP);
        next.extend_from_slice(&pop[..ELITES]);

        while next.len() < POP {
            let p1 = tournament(&pop, &mut rng);
            let p2 = tournament(&pop, &mut rng);
            let mut child_g = crossover(&p1.g, &p2.g, &mut rng);

            let strength = if rng.usize(100) < 80 { 1 + rng.usize(4) } else { 5 + rng.usize(10) };
            child_g = mutate(child_g, &mut rng, strength);
            let child = local_improve(make_ind(child_g), &mut rng, 4);
            next.push(child);
        }

        pop = next;
        pop.sort_by_key(|i| Reverse(key(i.s)));
        if better(pop[0].s, local_best.s) {
            local_best = pop[0]; stale = 0;
            update_global(&global, local_best);
        }

        // Migration: import the globally best genome and perturb it differently on each island.
        if generations % 120 == 0 {
            if let Some(gb) = *global.lock().unwrap() {
                let migration_strength = 3 + rng.usize(8);
                let migrant_g = mutate(gb.g, &mut rng, migration_strength);
                let migrant = local_improve(make_ind(migrant_g), &mut rng, 3);
                pop[POP - 1] = migrant;
            }
        }

        // Diversity reset if an island has converged for too long.
        if stale > 350 {
            pop.sort_by_key(|i| Reverse(key(i.s)));
            for slot in pop.iter_mut().skip(ELITES) {
                let base = if rng.coin(0.55) {
                    local_best.g
                } else {
                    let density = 0.18 + 0.28 * rng.f64();
                    random_grid(&mut rng, density)
                };
                let reset_strength = 8 + rng.usize(20);
                let reset_g = mutate(base, &mut rng, reset_strength);
                *slot = local_improve(make_ind(reset_g), &mut rng, 3);
            }
            stale = 0;
        }
    }

    (local_best, generations)
}

fn print_grid(g: &Grid) {
    for y in 0..N {
        for x in 0..N { print!("{}", if get(g, x, y) { '#' } else { '.' }); }
        println!();
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let seconds = args.get(1).and_then(|s| s.parse::<f64>().ok()).unwrap_or(30.0);
    let hw = thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let threads = args.get(2).and_then(|s| s.parse::<usize>().ok()).unwrap_or(hw.min(16)).clamp(1, 64);
    let seed = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64;

    let global = Arc::new(Mutex::new(None::<Individual>));
    let mut handles = Vec::with_capacity(threads);
    for id in 0..threads {
        let g = Arc::clone(&global);
        handles.push(thread::spawn(move || island(id, seconds, seed, g)));
    }

    let mut total_generations = 0u64;
    let mut best = None::<Individual>;
    for h in handles {
        let (b, gens) = h.join().expect("island thread panicked");
        total_generations += gens;
        if best.map(|x| better(b.s, x.s)).unwrap_or(true) { best = Some(b); }
    }
    if let Some(gb) = *global.lock().unwrap() {
        if best.map(|x| better(gb.s, x.s)).unwrap_or(true) { best = Some(gb); }
    }

    let best = best.expect("no result");
    println!("SATE V7 Parallel Memetic Islands");
    println!("threads={threads} total_generations={total_generations}");
    println!("score={} alive={} overloaded={}", best.s.score, best.s.alive, best.s.overloaded);
    print_grid(&best.g);
}
