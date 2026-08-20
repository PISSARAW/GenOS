use std::collections::{HashSet, VecDeque};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const N: usize = 20;
const MASK: u32 = (1u32 << N) - 1;
type Grid = [u32; N];

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct Stats {
    score: i32,
    alive: i32,
    overloaded: i32,
}

#[derive(Clone, Copy)]
struct Rng(u64);
impl Rng {
    fn new(seed: u64) -> Self { Self(seed.max(1)) }
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn usize(&mut self, n: usize) -> usize { (self.next() as usize) % n }
    fn f64(&mut self) -> f64 { (self.next() >> 11) as f64 / ((1u64 << 53) as f64) }
    fn coin(&mut self, p: f64) -> bool { self.f64() < p }
}

#[inline]
fn bit(x: usize) -> u32 { 1u32 << x }
#[inline]
fn get(g: &Grid, x: usize, y: usize) -> bool { (g[y] & bit(x)) != 0 }
#[inline]
fn flip(g: &mut Grid, x: usize, y: usize) { g[y] ^= bit(x); }
#[inline]
fn set(g: &mut Grid, x: usize, y: usize, value: bool) {
    if value { g[y] |= bit(x); } else { g[y] &= !bit(x); }
    g[y] &= MASK;
}

#[inline]
fn neighborhood_mask(x: usize) -> u32 {
    let b = bit(x);
    (b | (b << 1) | (b >> 1)) & MASK
}

#[inline]
fn neighbors(g: &Grid, x: usize, y: usize) -> u32 {
    let m = neighborhood_mask(x);
    let mut n = 0;
    if y > 0 { n += (g[y - 1] & m).count_ones(); }
    n += (g[y] & m).count_ones() - get(g, x, y) as u32;
    if y + 1 < N { n += (g[y + 1] & m).count_ones(); }
    n
}

#[inline]
fn evaluate(g: &Grid) -> Stats {
    let alive = g.iter().map(|r| (r & MASK).count_ones() as i32).sum::<i32>();
    let mut overloaded = 0i32;
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

fn hash_grid(g: &Grid) -> u64 {
    let mut h = 0x9E37_79B9_7F4A_7C15u64;
    for (i, &row) in g.iter().enumerate() {
        let mut z = (row as u64) ^ (i as u64 + 1).wrapping_mul(0xBF58_476D_1CE4_E5B9u64);
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        h ^= z ^ (z >> 31);
        h = h.rotate_left(11);
    }
    h
}

fn random_grid(rng: &mut Rng, density: f64) -> Grid {
    let mut g = [0u32; N];
    for y in 0..N {
        for x in 0..N {
            if rng.coin(density) { g[y] |= bit(x); }
        }
    }
    g
}

fn random_live(g: &Grid, rng: &mut Rng) -> Option<(usize, usize)> {
    for _ in 0..64 {
        let x = rng.usize(N); let y = rng.usize(N);
        if get(g, x, y) { return Some((x, y)); }
    }
    for y in 0..N { for x in 0..N { if get(g, x, y) { return Some((x, y)); } } }
    None
}

fn random_dead(g: &Grid, rng: &mut Rng) -> Option<(usize, usize)> {
    for _ in 0..64 {
        let x = rng.usize(N); let y = rng.usize(N);
        if !get(g, x, y) { return Some((x, y)); }
    }
    for y in 0..N { for x in 0..N { if !get(g, x, y) { return Some((x, y)); } } }
    None
}

fn overloaded_cell(g: &Grid, rng: &mut Rng) -> Option<(usize, usize)> {
    let start = rng.usize(N * N);
    for k in 0..N * N {
        let p = (start + k) % (N * N);
        let x = p % N; let y = p / N;
        if get(g, x, y) && neighbors(g, x, y) > 3 { return Some((x, y)); }
    }
    None
}

fn best_of_sampled_flips(g: &Grid, rng: &mut Rng, samples: usize) -> Grid {
    let mut best = *g;
    let mut best_s = i32::MIN;
    for _ in 0..samples {
        let x = rng.usize(N); let y = rng.usize(N);
        let mut c = *g;
        flip(&mut c, x, y);
        let s = evaluate(&c).score;
        if s > best_s || (s == best_s && rng.coin(0.25)) {
            best_s = s; best = c;
        }
    }
    best
}

fn propose(g: &Grid, rng: &mut Rng) -> Grid {
    let roll = rng.usize(100);

    if roll < 42 {
        // Intensification: best among a small random 1-flip neighborhood.
        return best_of_sampled_flips(g, rng, 10);
    }

    if roll < 62 {
        // Targeted repair: delete either an overloaded cell or one of its live neighbors.
        if let Some((x, y)) = overloaded_cell(g, rng) {
            let mut choices = Vec::with_capacity(9);
            choices.push((x, y));
            for dy in -1isize..=1 {
                for dx in -1isize..=1 {
                    let nx = x as isize + dx; let ny = y as isize + dy;
                    if nx >= 0 && ny >= 0 && nx < N as isize && ny < N as isize {
                        let p = (nx as usize, ny as usize);
                        if get(g, p.0, p.1) && !choices.contains(&p) { choices.push(p); }
                    }
                }
            }
            let mut best = *g; let mut bs = i32::MIN;
            for (cx, cy) in choices {
                let mut c = *g; set(&mut c, cx, cy, false);
                let s = evaluate(&c).score;
                if s > bs { bs = s; best = c; }
            }
            return best;
        }
    }

    if roll < 82 {
        // Swap: preserves density while allowing topology to move.
        if let (Some((lx, ly)), Some((dx, dy))) = (random_live(g, rng), random_dead(g, rng)) {
            let mut c = *g;
            set(&mut c, lx, ly, false);
            set(&mut c, dx, dy, true);
            return c;
        }
    }

    if roll < 95 {
        // Truly reversible random 1-flip (the original code usually only added cells).
        let mut c = *g;
        flip(&mut c, rng.usize(N), rng.usize(N));
        return c;
    }

    // Small kick: 2..=5 flips to cross narrow barriers.
    let mut c = *g;
    let k = 2 + rng.usize(4);
    for _ in 0..k { flip(&mut c, rng.usize(N), rng.usize(N)); }
    c
}

fn print_grid(g: &Grid) {
    for y in 0..N {
        for x in 0..N { print!("{}", if get(g, x, y) { '#' } else { '.' }); }
        println!();
    }
}

fn main() {
    let seconds = std::env::args().nth(1).and_then(|s| s.parse::<f64>().ok()).unwrap_or(30.0);
    let seed = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64;
    let mut rng = Rng::new(seed ^ 0xA5A5_5A5A_C3C3_3C3C);

    // A moderate density gives the search room to add and remove cells.
    let mut current = random_grid(&mut rng, 0.28);
    let mut cs = evaluate(&current);
    let mut best = current;
    let mut bs = cs;

    let mut tabu_q = VecDeque::<u64>::new();
    let mut tabu = HashSet::<u64>::new();
    let tabu_cap = 192usize;

    let deadline = Instant::now() + Duration::from_secs_f64(seconds.max(0.01));
    let mut iter = 0u64;
    let mut since_best = 0u64;
    let mut cycle_pos = 0u64;

    while Instant::now() < deadline {
        iter += 1;
        cycle_pos += 1;
        since_best += 1;

        // Saw-tooth schedule: it never freezes forever.
        const CYCLE: u64 = 40_000;
        let phase = (cycle_pos % CYCLE) as f64 / CYCLE as f64;
        let temp = 0.18 + 4.5 * (1.0 - phase).powi(2);

        let next = propose(&current, &mut rng);
        let ns = evaluate(&next);
        let h = hash_grid(&next);

        let aspiration = ns.score > bs.score;
        if !aspiration && tabu.contains(&h) { continue; }

        let diff = ns.score - cs.score;
        let accept = diff >= 0 || rng.f64() < ((diff as f64) / temp).exp();
        if accept {
            current = next;
            cs = ns;

            tabu.insert(h);
            tabu_q.push_back(h);
            if tabu_q.len() > tabu_cap {
                if let Some(old) = tabu_q.pop_front() { tabu.remove(&old); }
            }

            if cs.score > bs.score || (cs.score == bs.score && cs.overloaded < bs.overloaded) {
                best = current; bs = cs; since_best = 0;
            }
        }

        // Stagnation => return near the incumbent, but not exactly on it.
        if since_best > 25_000 {
            current = best;
            let kick = 8 + rng.usize(17);
            for _ in 0..kick { flip(&mut current, rng.usize(N), rng.usize(N)); }
            cs = evaluate(&current);
            since_best = 0;
            cycle_pos = 0;
            tabu.clear(); tabu_q.clear();
        }
    }

    println!("SATE V5 Adaptive-SA");
    println!("iterations={iter}");
    println!("score={} alive={} overloaded={}", bs.score, bs.alive, bs.overloaded);
    print_grid(&best);
}
