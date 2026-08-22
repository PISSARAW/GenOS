use std::collections::HashMap;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const N: usize = 20;
const MASK: u32 = (1u32 << N) - 1;
type Grid = [u32; N];

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct Stats { score: i32, alive: i32, overloaded: i32 }

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
#[inline]
fn better(a: Stats, b: Stats) -> bool {
    a.score > b.score ||
    (a.score == b.score && a.overloaded < b.overloaded) ||
    (a.score == b.score && a.overloaded == b.overloaded && a.alive > b.alive)
}
fn hash_grid(g: &Grid) -> u64 {
    let mut h = 0x243F_6A88_85A3_08D3u64;
    for (i, &r) in g.iter().enumerate() {
        let mut z = (r as u64).wrapping_add((i as u64 + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15));
        z ^= z >> 30; z = z.wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z ^= z >> 27; z = z.wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        h ^= z; h = h.rotate_left(9).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    }
    h
}
fn random_grid(rng: &mut Rng, density: f64) -> Grid {
    let mut g = [0u32; N];
    for y in 0..N { for x in 0..N { if rng.coin(density) { set(&mut g, x, y, true); } } }
    g
}

fn choose_overloaded(g: &Grid, rng: &mut Rng) -> Option<(usize, usize)> {
    let start = rng.usize(N * N);
    for k in 0..N * N {
        let p = (start + k) % (N * N); let x = p % N; let y = p / N;
        if get(g, x, y) && neighbors(g, x, y) > 3 { return Some((x, y)); }
    }
    None
}

fn candidate(g: &Grid, rng: &mut Rng) -> Grid {
    let mode = rng.usize(100);
    let mut c = *g;

    if mode < 30 {
        // One arbitrary reversible flip.
        flip(&mut c, rng.usize(N), rng.usize(N));
        return c;
    }

    if mode < 50 {
        // Density-preserving relocation.
        let mut live = None; let mut dead = None;
        for _ in 0..40 {
            let x = rng.usize(N); let y = rng.usize(N);
            if get(g, x, y) { live = Some((x, y)); } else { dead = Some((x, y)); }
            if live.is_some() && dead.is_some() { break; }
        }
        if let (Some((lx, ly)), Some((dx, dy))) = (live, dead) {
            set(&mut c, lx, ly, false); set(&mut c, dx, dy, true);
        } else {
            flip(&mut c, rng.usize(N), rng.usize(N));
        }
        return c;
    }

    if mode < 70 {
        // Remove the best cell in the 3x3 vicinity of an overloaded live cell.
        if let Some((x, y)) = choose_overloaded(g, rng) {
            let mut best = None::<(Grid, Stats)>;
            for dy in -1isize..=1 {
                for dx in -1isize..=1 {
                    let nx = x as isize + dx; let ny = y as isize + dy;
                    if nx < 0 || ny < 0 || nx >= N as isize || ny >= N as isize { continue; }
                    let ux = nx as usize; let uy = ny as usize;
                    if !get(g, ux, uy) { continue; }
                    let mut t = *g; set(&mut t, ux, uy, false);
                    let ts = evaluate(&t);
                    if best.map(|(_, s)| better(ts, s)).unwrap_or(true) { best = Some((t, ts)); }
                }
            }
            if let Some((t, _)) = best { return t; }
        }
    }

    if mode < 88 {
        // Add the best of several dead cells. This is far less myopic than neighbors<2 only.
        let mut best = None::<(Grid, Stats)>;
        for _ in 0..12 {
            let x = rng.usize(N); let y = rng.usize(N);
            if get(g, x, y) { continue; }
            let mut t = *g; set(&mut t, x, y, true);
            let ts = evaluate(&t);
            if best.map(|(_, s)| better(ts, s)).unwrap_or(true) { best = Some((t, ts)); }
        }
        if let Some((t, _)) = best { return t; }
    }

    // Patch mutation: toggle 2..6 cells in a compact 3x3 neighborhood.
    let cx = rng.usize(N); let cy = rng.usize(N);
    let k = 2 + rng.usize(5);
    for _ in 0..k {
        let dx = rng.usize(3) as isize - 1; let dy = rng.usize(3) as isize - 1;
        let x = (cx as isize + dx).clamp(0, (N - 1) as isize) as usize;
        let y = (cy as isize + dy).clamp(0, (N - 1) as isize) as usize;
        flip(&mut c, x, y);
    }
    c
}

fn greedy_polish(mut g: Grid, rng: &mut Rng, rounds: usize) -> Grid {
    let mut gs = evaluate(&g);
    for _ in 0..rounds {
        let mut best = g; let mut bs = gs;
        for _ in 0..40 {
            let mut c = g;
            flip(&mut c, rng.usize(N), rng.usize(N));
            let cs = evaluate(&c);
            if better(cs, bs) { best = c; bs = cs; }
        }
        if better(bs, gs) { g = best; gs = bs; } else { break; }
    }
    g
}

fn ruin_recreate(base: &Grid, rng: &mut Rng) -> Grid {
    let mut g = *base;
    let side = 4 + rng.usize(5); // 4..8
    let x0 = rng.usize(N - side + 1); let y0 = rng.usize(N - side + 1);

    let local_density = 0.20 + 0.25 * rng.f64();
    for y in y0..y0 + side {
        for x in x0..x0 + side {
            set(&mut g, x, y, rng.coin(local_density));
        }
    }
    greedy_polish(g, rng, 20)
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
    let mut rng = Rng::new(seed ^ 0xD1B5_4A32_D192_ED03);

    let mut current = greedy_polish(random_grid(&mut rng, 0.30), &mut rng, 30);
    let mut cs = evaluate(&current);
    let mut best = current; let mut bs = cs;

    let deadline = Instant::now() + Duration::from_secs_f64(seconds.max(0.01));
    let mut iter = 0u64; let mut stagnation = 0u64;
    let mut tenure = 70u64;
    let mut tabu_until = HashMap::<u64, u64>::new();
    let mut last_visit = HashMap::<u64, u64>::new();

    while Instant::now() < deadline {
        iter += 1; stagnation += 1;

        // Sample a broad neighborhood and take the best admissible move.
        let mut chosen = None::<(Grid, Stats, u64)>;
        for _ in 0..48 {
            let c = candidate(&current, &mut rng);
            let s = evaluate(&c);
            let h = hash_grid(&c);
            let tabu = tabu_until.get(&h).copied().unwrap_or(0) > iter;
            let aspiration = better(s, bs);
            if tabu && !aspiration { continue; }
            if chosen.map(|(_, old, _)| better(s, old)).unwrap_or(true) {
                chosen = Some((c, s, h));
            }
        }

        if let Some((next, ns, h)) = chosen {
            // Mark the state we are leaving as tabu; this prevents immediate cycling.
            tabu_until.insert(hash_grid(&current), iter + tenure);
            current = next; cs = ns;

            if let Some(prev) = last_visit.insert(h, iter) {
                if iter - prev < 1500 { tenure = (tenure + 12).min(260); }
            }
            if iter % 500 == 0 { tenure = tenure.saturating_sub(1).max(35); }

            if better(cs, bs) {
                best = current; bs = cs; stagnation = 0;
            }
        }

        if iter % 5000 == 0 {
            tabu_until.retain(|_, until| *until > iter);
            last_visit.retain(|_, last| iter - *last < 50_000);
        }

        // Large-neighborhood restart around the best structure found so far.
        if stagnation > 2_500 {
            current = ruin_recreate(&best, &mut rng);
            cs = evaluate(&current);
            stagnation = 0;
            tabu_until.clear();
            tenure = 70;
        }
    }

    println!("SATE V6 Reactive-Tabu + LNS");
    println!("iterations={iter} tabu_tenure={tenure}");
    println!("score={} alive={} overloaded={}", bs.score, bs.alive, bs.overloaded);
    print_grid(&best);
}
