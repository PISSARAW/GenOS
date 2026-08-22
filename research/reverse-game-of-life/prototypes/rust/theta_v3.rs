use std::collections::LinkedHashMap; // Pour un cache LRU

struct HybridSolver;
impl HybridSolver {
    fn solve(hl: &mut HashLife, start_root: usize, rng: &mut Rng) -> usize {
        let mut current = start_root;
        let mut best = current;
        let mut current_score = fitness(hl, current);
        let mut best_score = current_score;

        let mut temp = 100.0f32;
        let cooling_rate = 0.99;
        let mut tabu: Vec<usize> = Vec::new();
        let mut stagnation = 0;

        let start_time = Instant::now();
        while start_time.elapsed().as_secs_f32() < 30.0 {
            // 1. Mutation classique (recuit simulé)
            let next = mutate(hl, current, rng);
            let next_score = fitness(hl, next);

            if should_accept(AcceptArgs {
                ns: next_score, cs: current_score, temp, bs: best_score, next, tabu: &tabu
            }, rng) {
                current = next;
                current_score = next_score;
                tabu.push(current);
                if tabu.len() > 20 { tabu.remove(0); }
            }

            // 2. Recherche locale si stagnation
            if stagnation > 100 {
                current = self.local_search(hl, current, rng);
                current_score = fitness(hl, current);
                stagnation = 0;
            }

            // Met à jour le meilleur score
            if current_score > best_score {
                best_score = current_score;
                best = current;
                stagnation = 0;
            } else {
                stagnation += 1;
            }

            temp *= cooling_rate;
            if temp < 0.01 { temp = 0.01; }
        }

        best
    }

    // Recherche locale : explore les voisins proches
    fn local_search(&self, hl: &mut HashLife, root: usize, rng: &mut Rng) -> usize {
        let mut grid = [[0; SIZE]; SIZE];
        let mut ctx = GridContext { hl, grid: &mut grid };
        ctx.fill(FillArgs { node: root, level: 5, pos: (0, 0) });

        let mut best_local = root;
        let mut best_local_score = fitness(hl, root);

        // Essaye toutes les modifications possibles dans un rayon de 2
        for y in 0..SIZE {
            for x in 0..SIZE {
                for dy in -2..=2 {
                    for dx in -2..=2 {
                        let nx = (x as i32 + dx + SIZE as i32) as usize % SIZE;
                        let ny = (y as i32 + dy + SIZE as i32) as usize % SIZE;

                        let mut new_grid = grid;
                        new_grid[ny][nx] ^= 1; // Inverse la cellule

                        if SATSolver::solve_anti_symmetry(&new_grid) {
                            let canon = canonical(&new_grid);
                            let new_root = hl.build_tree(BuildArgs { grid: &canon, level: 5, pos: (0, 0) });
                            let new_score = fitness(hl, new_root);

                            if new_score > best_local_score {
                                best_local_score = new_score;
                                best_local = new_root;
                            }
                        }
                    }
                }
            }
        }

        best_local
    }
}
