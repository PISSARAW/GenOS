use std::fs;
// No external rand dependency

type Trajectory = [[[u8; 20]; 20]; 5];

struct Rng { state: u64 }
impl Rng {
    fn new() -> Self { Rng { state: 88172645463325252 } }
    fn next_u64(&mut self) -> u64 {
        let mut x = self.state; if x == 0 { x = 1; }
        x ^= x << 13; x ^= x >> 7; x ^= x << 17;
        self.state = x; x
    }
    fn gen_f64(&mut self) -> f64 { (self.next_u64() as f64) / (u64::MAX as f64) }
    fn gen_range(&mut self, end: usize) -> usize { if end == 0 { 0 } else { (self.next_u64() as usize) % end } }
}

#[derive(Copy, Clone, Default)]
struct Coord { t: usize, x: usize, y: usize }
impl Coord { fn new(t: usize, x: usize, y: usize) -> Self { Self { t, x, y } } }

struct WalkSatEngine {
    trajectory: Trajectory,
    target: [[u8; 20]; 20],
    violations_dense: Vec<u16>,
    violations_sparse: [i16; 2000],
    clause_weights: [[[u32; 20]; 20]; 5],       
    vraw_score: u32,       
    vweighted_score: u32,  
    rng: Rng,
    tabu: [[[u32; 20]; 20]; 5],
    iter: u32,
}

impl WalkSatEngine {
    fn new(target: [[u8; 20]; 20], rng: Rng) -> Self {
        let mut e = WalkSatEngine {
            trajectory: [[[0;20];20];5], target, violations_dense: Vec::with_capacity(2000),
            violations_sparse: [-1;2000], clause_weights: [[[1;20];20];5],
            vraw_score: 0, vweighted_score: 0, rng, tabu: [[[0;20];20];5], iter: 0,
        };
        e.init_retrograde_wave(); e
    }

    fn init_retrograde_wave(&mut self) {
        if self.rng.gen_f64() < 0.5 {
            for t in 0..5 {
                for y in 0..20 {
                    for x in 0..20 {
                        self.trajectory[t][y][x] = self.rng.gen_range(2) as u8;
                    }
                }
            }
        } else {
            for y in 0..20 {
                for x in 0..20 {
                    self.trajectory[4][y][x] = self.target[y][x];
                }
            }
            for t in (0..4).rev() {
                for y in 0..20 {
                    for x in 0..20 {
                        self.trajectory[t][y][x] = self.trajectory[t+1][y][x];
                        if self.rng.gen_f64() < 0.2 {
                            self.trajectory[t][y][x] = 1 - self.trajectory[t][y][x];
                        }
                    }
                }
            }
        }
        self.recompute_all_violations();
    }

    fn count_neighbors(&self, pos: Coord) -> u8 {
        let mut count = 0;
        let t = pos.t;
        for dy in -1..=1 {
            for dx in -1..=1 {
                if dx == 0 && dy == 0 { continue; }
                let nx = pos.x as isize + dx;
                let ny = pos.y as isize + dy;
                if nx >= 0 && nx < 20 && ny >= 0 && ny < 20 {
                    count += self.trajectory[t][ny as usize][nx as usize];
                }
            }
        }
        count
    }

    fn add_violation(&mut self, pos: Coord) {
        let id = pos.t * 400 + pos.y * 20 + pos.x;
        if self.violations_sparse[id] == -1 {
            let idx = self.violations_dense.len();
            self.violations_dense.push(id as u16);
            self.violations_sparse[id] = idx as i16;
            self.vraw_score += 1;
            self.vweighted_score += self.clause_weights[pos.t][pos.y][pos.x];
        }
    }

    fn remove_violation(&mut self, pos: Coord) {
        let id = pos.t * 400 + pos.y * 20 + pos.x;
        let idx = self.violations_sparse[id];
        if idx != -1 {
            let idx = idx as usize;
            let last_val = *self.violations_dense.last().unwrap();
            self.violations_dense[idx] = last_val;
            self.violations_sparse[last_val as usize] = idx as i16;
            self.violations_dense.pop();
            self.violations_sparse[id] = -1;
            self.vraw_score -= 1;
            self.vweighted_score -= self.clause_weights[pos.t][pos.y][pos.x];
        }
    }

    fn is_violated(&self, pos: Coord) -> bool {
        self.violations_sparse[pos.t * 400 + pos.y * 20 + pos.x] != -1
    }

    fn get_next_actual_state(&self, pos: Coord) -> u8 {
        if pos.t == 4 {
            self.target[pos.y][pos.x]
        } else {
            self.trajectory[pos.t+1][pos.y][pos.x]
        }
    }

    fn is_transition_valid(&self, pos: Coord) -> bool {
        let alive = self.trajectory[pos.t][pos.y][pos.x] == 1;
        let neighbors = self.count_neighbors(pos);
        let next_state = if (alive && (neighbors == 2 || neighbors == 3)) || (!alive && neighbors == 3) { 1 } else { 0 };
        next_state == self.get_next_actual_state(pos)
    }

    fn recompute_all_violations(&mut self) {
        self.violations_dense.clear();
        self.violations_sparse = [-1; 2000];
        self.vraw_score = 0;
        self.vweighted_score = 0;
        for t in 0..5 {
            for y in 0..20 {
                for x in 0..20 {
                    let pos = Coord::new(t, x, y);
                    if !self.is_transition_valid(pos) {
                        self.add_violation(pos);
                    }
                }
            }
        }
    }

    fn fill_affected_constraints(&self, flip: Coord, affected: &mut [Coord; 10]) -> usize {
        let mut count = 0;
        if flip.t > 0 { 
            affected[count] = Coord::new(flip.t - 1, flip.x, flip.y);
            count += 1;
        }
        for dy in -1..=1 {
            for dx in -1..=1 {
                let nx = flip.x as isize + dx;
                let ny = flip.y as isize + dy;
                if nx >= 0 && nx < 20 && ny >= 0 && ny < 20 {
                    affected[count] = Coord::new(flip.t, nx as usize, ny as usize);
                    count += 1;
                }
            }
        }
        count
    }

    fn get_simulated_cell(&self, check_pos: Coord, flip: Coord) -> u8 {
        let mut val = self.trajectory[check_pos.t][check_pos.y][check_pos.x];
        if check_pos.t == flip.t && check_pos.x == flip.x && check_pos.y == flip.y {
            val = 1 - val;
        }
        val
    }

    fn count_simulated_neighbors(&self, at: Coord, flip: Coord) -> u8 {
        let mut neighbors = 0;
        for dy in -1..=1 {
            for dx in -1..=1 {
                if dx == 0 && dy == 0 { continue; }
                let nx = at.x as isize + dx;
                let ny = at.y as isize + dy;
                if nx >= 0 && nx < 20 && ny >= 0 && ny < 20 {
                    let mut val = self.trajectory[at.t][ny as usize][nx as usize];
                    if flip.t == at.t && nx as usize == flip.x && ny as usize == flip.y {
                        val = 1 - val;
                    }
                    neighbors += val;
                }
            }
        }
        neighbors
    }

    fn simulate_flip_constraint(&self, flip: Coord, at: Coord) -> bool {
        let alive = self.get_simulated_cell(at, flip);
        let neighbors = self.count_simulated_neighbors(at, flip);

        let next_state = if (alive == 1 && (neighbors == 2 || neighbors == 3)) || (alive == 0 && neighbors == 3) { 1 } else { 0 };
        
        let actual_next_state = if at.t == 4 {
            self.target[at.y][at.x]
        } else {
            let next_pos = Coord::new(at.t + 1, at.x, at.y);
            self.get_simulated_cell(next_pos, flip)
        };

        next_state != actual_next_state
    }

    fn apply_flip_and_update(&mut self, flip: Coord) {
        let mut affected = [Coord::default(); 10];
        let a_count = self.fill_affected_constraints(flip, &mut affected);
        
        self.trajectory[flip.t][flip.y][flip.x] = 1 - self.trajectory[flip.t][flip.y][flip.x];

        for i in 0..a_count {
            let at = affected[i];
            let is_valid = self.is_transition_valid(at);
            let was_violated = self.is_violated(at);
            
            if is_valid && was_violated {
                self.remove_violation(at);
            } else if !is_valid && !was_violated {
                self.add_violation(at);
            }
        }
    }

    fn smooth_weights(&mut self) {
        self.vweighted_score = 0;
        for t in 0..5 { for y in 0..20 { for x in 0..20 {
            if self.clause_weights[t][y][x] > 1 { self.clause_weights[t][y][x] = 1 + (self.clause_weights[t][y][x] - 1) * 9 / 10; }
            if self.is_violated(Coord::new(t, x, y)) { self.vweighted_score += self.clause_weights[t][y][x]; }
        }}}
    }

    fn fill_candidate_vars(&self, v_pos: Coord, c_vars: &mut [Coord; 10]) -> usize {
        let mut c_count = 0;
        if v_pos.t < 4 {
            c_vars[c_count] = Coord::new(v_pos.t + 1, v_pos.x, v_pos.y);
            c_count += 1;
        }
        for dy in -1..=1 {
            for dx in -1..=1 {
                let nx = v_pos.x as isize + dx;
                let ny = v_pos.y as isize + dy;
                if nx >= 0 && nx < 20 && ny >= 0 && ny < 20 {
                    c_vars[c_count] = Coord::new(v_pos.t, nx as usize, ny as usize);
                    c_count += 1;
                }
            }
        }
        c_count
    }

    fn evaluate_candidates(&self, candidates: &[Coord], count: usize) -> ([Coord; 10], usize, i32) {
        let mut min_break = i32::MAX;
        let mut best_vars = [Coord::default(); 10];
        let mut best_count = 0;
        let mut affected = [Coord::default(); 10];

        for i in 0..count {
            let ct = candidates[i];
            
            // Tabu check (tenure of 20) unless it decreases min_break below absolute best
            let is_tabu = self.iter > self.tabu[ct.t][ct.y][ct.x] && self.iter - self.tabu[ct.t][ct.y][ct.x] < 20;

            let mut break_c = 0;
            
            let a_count = self.fill_affected_constraints(ct, &mut affected);
            for j in 0..a_count {
                let at = affected[j];
                let is_cur_viol = self.is_violated(at);
                if !is_cur_viol {
                    let would_viol = self.simulate_flip_constraint(ct, at);
                    if would_viol { break_c += 1; }
                }
            }
            
            if break_c < min_break {
                min_break = break_c;
                best_vars[0] = ct;
                best_count = 1;
            } else if break_c == min_break && (!is_tabu || break_c == 0) {
                best_vars[best_count] = ct;
                best_count += 1;
            }
        }
        
        // If all best are tabu, we might just pick one anyway (best_count > 0 handles this)
        (best_vars, best_count.max(1), min_break)
    }

    fn walksat_step(&mut self) {
        if self.vraw_score == 0 { return; }

        let rand_idx = self.rng.gen_range(self.violations_dense.len());
        let violation_id = self.violations_dense[rand_idx] as usize;
        let vt = violation_id / 400;
        let rem = violation_id % 400;
        let vy = rem / 20;
        let vx = rem % 20;

        let mut candidate_vars = [Coord::default(); 10];
        let v_pos = Coord::new(vt, vx, vy);
        let c_count = self.fill_candidate_vars(v_pos, &mut candidate_vars);

        let (best_vars, best_count, min_break) = self.evaluate_candidates(&candidate_vars, c_count);

        let flip_var = if min_break == 0 {
            best_vars[self.rng.gen_range(best_count)]
        } else {
            if self.rng.gen_f64() < 0.30 { // 30% noise
                candidate_vars[self.rng.gen_range(c_count)]
            } else {
                best_vars[self.rng.gen_range(best_count)]
            }
        };
        
        self.tabu[flip_var.t][flip_var.y][flip_var.x] = self.iter;
        self.iter += 1;
        
        self.apply_flip_and_update(flip_var);
    }
}

fn load_target_grid(path: &str) -> [[u8; 20]; 20] {
    let content = fs::read_to_string(path).expect("Impossible de lire target_grid.txt");
    let mut grid = [[0; 20]; 20];
    for (y, line) in content.lines().filter(|l| !l.is_empty()).enumerate() {
        if y >= 20 { break; }
        for (x, ch) in line.chars().enumerate() {
            if x >= 20 { break; }
            grid[y][x] = if ch == '1' { 1 } else { 0 };
        }
    }
    grid
}

fn main() {
    println!("Démarrage Gen 10.1 Omega FAST WalkSAT O(1)...");
    let target = load_target_grid("data/target_grid.txt");
    let mut rng = Rng::new();
    // seed based on time to be slightly random:
    rng.state = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos() as u64;
    
    let mut engine = WalkSatEngine::new(target, rng);
    println!("Violations initiales : {}", engine.vraw_score);
    
    let mut iter = 0;
    let mut best_vraw = engine.vraw_score;
    let mut last_improve = 0;
    
    loop {
        if engine.vraw_score == 0 {
            println!("Vraw=0 TROUVÉ ! INVERSION EXACTE à l'itération {}!", iter);
            break;
        }
        
        engine.walksat_step();
        
        if engine.vraw_score < best_vraw {
            best_vraw = engine.vraw_score;
            last_improve = iter;
            println!("Iter {} | Nouveau Best Vraw : {}", iter, best_vraw);
        }
        
        if iter - last_improve > 2_000_000 {
            println!("Iter {} | Restart! Vraw stagne à {}. Best: {}", iter, engine.vraw_score, best_vraw);
            let mut new_rng = Rng::new();
            new_rng.state = engine.rng.next_u64();
            engine = WalkSatEngine::new(target, new_rng);
            last_improve = iter;
        }
        
        if iter % 100_000 == 0 {
            println!("Iter {} | Vraw actuel : {}", iter, engine.vraw_score);
        }
        
        iter += 1;
    }
}
