use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::time::Instant;

const TIMEOUT: u128 = 29500;

static mut TARGET_GRID: [i8; 400] = [0; 400];
static mut BEST_DIST: i32 = 400;
static mut BEST_GRID: [i8; 400] = [0; 400];
static mut CALLS: u64 = 0;
static mut PRUNED: u64 = 0;
static mut IS_TIMEOUT: bool = false;

#[derive(Clone, Copy)]
struct Neighbors {
    list: [usize; 8],
    len: usize,
}

static mut NEIGHBORS_LIST: [Neighbors; 400] = [Neighbors {
    list: [0; 8],
    len: 0,
}; 400];

fn init_neighbors() {
    unsafe {
        let neighbors_ptr = std::ptr::addr_of_mut!(NEIGHBORS_LIST).cast::<Neighbors>();
        for i in 0..400 {
            let mut list = [0; 8];
            let mut len = 0;
            let x = (i % 20) as isize;
            let y = (i / 20) as isize;
            for dy in -1..=1 {
                for dx in -1..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let nx = x + dx;
                    let ny = y + dy;
                    if (0..20).contains(&nx) && (0..20).contains(&ny) {
                        list[len] = (ny * 20 + nx) as usize;
                        len += 1;
                    }
                }
            }
            neighbors_ptr.add(i).write(Neighbors { list, len });
        }
    }
}

fn load_target() {
    let file = File::open(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../data/target_grid.txt"
    ))
    .unwrap();
    let reader = BufReader::new(file);
    let mut y = 0;
    unsafe {
        for line in reader.lines() {
            let l = line.unwrap();
            let l = l.trim();
            if l.is_empty() {
                continue;
            }
            for (x, ch) in l.chars().enumerate() {
                if x < 20 {
                    TARGET_GRID[y * 20 + x] = ch.to_digit(10).unwrap() as i8;
                }
            }
            y += 1;
            if y == 20 {
                break;
            }
        }
    }
}

fn get_next_cell(c: i8, c1: i8, c2: i8) -> i8 {
    let sum_max = c1 + c2;
    let limit = if c == 0 { 3 } else { 2 };
    let can_a = c1 <= 3 && sum_max >= limit;
    let can_d = if c == 2 {
        !(c1 == 3 && sum_max == 3)
    } else {
        c1 < limit || sum_max > 3
    };
    if can_a && can_d {
        2
    } else if can_a {
        1
    } else {
        0
    }
}

fn project5(grid: &[i8; 400]) -> [i8; 400] {
    let mut curr = *grid;
    let mut next = [0; 400];
    unsafe {
        for _ in 0..5 {
            for i in 0..400 {
                let n_list = &NEIGHBORS_LIST[i];
                let mut c1 = 0;
                let mut c2 = 0;
                for j in 0..n_list.len {
                    let st = curr[n_list.list[j]];
                    if st == 1 {
                        c1 += 1;
                    } else if st == 2 {
                        c2 += 1;
                    }
                }
                next[i] = get_next_cell(curr[i], c1, c2);
            }
            curr = next;
        }
    }
    curr
}

fn check_prune(proj: &[i8; 400]) -> bool {
    unsafe {
        for i in 0..400 {
            let p = proj[i];
            if p != 2 && p != TARGET_GRID[i] {
                return true;
            }
        }
    }
    false
}

fn project_real_and_get_hamming(grid: &[i8; 400]) -> i32 {
    let mut curr = [0; 400];
    for (current, &cell) in curr.iter_mut().zip(grid) {
        *current = if cell == 2 { 0 } else { cell };
    }
    let mut next = [0; 400];
    unsafe {
        for _ in 0..5 {
            for i in 0..400 {
                let n_list = &NEIGHBORS_LIST[i];
                let mut ones = 0;
                for j in 0..n_list.len {
                    if curr[n_list.list[j]] == 1 {
                        ones += 1;
                    }
                }
                if curr[i] == 1 {
                    next[i] = if ones == 2 || ones == 3 { 1 } else { 0 };
                } else {
                    next[i] = if ones == 3 { 1 } else { 0 };
                }
            }
            curr = next;
        }
        let mut dist = 0;
        for i in 0..400 {
            if curr[i] != TARGET_GRID[i] {
                dist += 1;
            }
        }
        dist
    }
}

#[derive(Clone, Copy)]
struct VarOrder {
    i: usize,
    dist: f64,
}

fn get_vars_center_out() -> [usize; 400] {
    let mut vars = [VarOrder { i: 0, dist: 0.0 }; 400];
    for (i, var) in vars.iter_mut().enumerate() {
        let x = (i % 20) as f64;
        let y = (i / 20) as f64;
        let dist = ((x - 9.5).powi(2) + (y - 9.5).powi(2)).sqrt();
        *var = VarOrder { i, dist };
    }
    vars.sort_by(|a, b| a.dist.partial_cmp(&b.dist).unwrap());
    let mut res = [0; 400];
    for (result, var) in res.iter_mut().zip(vars) {
        *result = var.i;
    }
    res
}

#[allow(clippy::too_many_arguments)]
fn solve_dfs(
    grid: &mut [i8; 400],
    var_idx: usize,
    vars_order: &[usize; 400],
    start_time: Instant,
) -> bool {
    unsafe {
        CALLS += 1;
        if CALLS % 1000 == 0 && start_time.elapsed().as_millis() > TIMEOUT {
            IS_TIMEOUT = true;
            return true;
        }

        let proj = project5(grid);
        if check_prune(&proj) {
            PRUNED += 1;
            return false;
        }

        let real_dist = project_real_and_get_hamming(grid);
        if real_dist < BEST_DIST {
            BEST_DIST = real_dist;
            BEST_GRID = *grid;
            if BEST_DIST == 0 && var_idx == 400 {
                return true;
            }
        }

        if var_idx == 400 {
            return false;
        }

        let idx = vars_order[var_idx];

        grid[idx] = 0;
        if solve_dfs(grid, var_idx + 1, vars_order, start_time) {
            return true;
        }
        if IS_TIMEOUT {
            return true;
        }

        grid[idx] = 1;
        if solve_dfs(grid, var_idx + 1, vars_order, start_time) {
            return true;
        }
        if IS_TIMEOUT {
            return true;
        }

        grid[idx] = 2; // backtrack
        false
    }
}

fn main() {
    init_neighbors();
    load_target();
    let vars_order = get_vars_center_out();
    let mut grid = [2; 400];
    unsafe {
        BEST_GRID = [2; 400];
    }

    let start_time = Instant::now();
    solve_dfs(&mut grid, 0, &vars_order, start_time);
    let time_sec = start_time.elapsed().as_secs_f64();
    let time_sec = if time_sec == 0.0 { 0.001 } else { time_sec };

    unsafe {
        let calls = CALLS;
        let pruned = PRUNED;
        let best_dist = BEST_DIST;
        println!("Calls: {calls}");
        println!("Pruned: {pruned}");
        println!("Nodes/sec: {}", (calls as f64 / time_sec) as u64);
        println!("Best Hamming: {best_dist}");

        let mut file = File::create(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../results/gen0_v5_rust.txt"
        ))
        .unwrap();
        for y in 0..20 {
            let mut row = String::new();
            for x in 0..20 {
                let val = BEST_GRID[y * 20 + x];
                row.push_str(&format!("{}", if val == 2 { 0 } else { val }));
            }
            writeln!(file, "{}", row).unwrap();
        }
    }
}
