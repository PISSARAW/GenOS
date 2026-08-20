use std::cmp::Ordering;

// === ALGORITHME GÉNÉTIQUE ===
struct GeneticSolver {
    population_size: usize,
    mutation_rate: f32,
    elite_size: usize,
}

impl GeneticSolver {
    fn new() -> Self {
        GeneticSolver {
            population_size: 50,   // Taille de la population
            mutation_rate: 0.1,    // 10% de mutation
            elite_size: 5,         // Garde les 5 meilleures solutions
        }
    }

    fn solve(&self, hl: &mut HashLife, rng: &mut Rng) -> usize {
        // 1. Générer une population initiale valide
        let mut population: Vec<usize> = (0..self.population_size)
            .map(|_| generate_initial(hl, rng))
            .collect();

        // 2. Évaluer la fitness de chaque individu
        let mut fitness_scores: Vec<i32> = population
            .iter()
            .map(|&root| fitness(hl, root))
            .collect();

        let mut best_score = fitness_scores.iter().max().copied().unwrap_or(-10000);
        let mut best_root = population[fitness_scores.iter().position_max().unwrap_or(0)];

        // 3. Boucle d'évolution
        for _ in 0..1000 { // 1000 générations max
            let mut new_population = Vec::with_capacity(self.population_size);

            // Élitisme : garde les meilleures solutions
            let mut indices: Vec<usize> = (0..population.len()).collect();
            indices.sort_by(|&a, &b| fitness_scores[b].cmp(&fitness_scores[a]));
            for &idx in &indices[..self.elite_size] {
                new_population.push(population[idx]);
            }

            // Remplit le reste avec crossover + mutation
            while new_population.len() < self.population_size {
                let parent1 = self.select(&fitness_scores, rng);
                let parent2 = self.select(&fitness_scores, rng);
                let child = self.crossover(hl, population[parent1], population[parent2], rng);
                let mutated = self.mutate(hl, child, rng);
                new_population.push(mutated);
            }

            population = new_population;
            fitness_scores = population.iter().map(|&root| fitness(hl, root)).collect();

            // Met à jour le meilleur score
            let current_best = fitness_scores.iter().max().copied().unwrap_or(-10000);
            if current_best > best_score {
                best_score = current_best;
                best_root = population[fitness_scores.iter().position_max().unwrap_or(0)];
            }
        }

        best_root
    }

    // Sélection par tournoi (meilleur parmi 3 aléatoires)
    fn select(&self, scores: &[i32], rng: &mut Rng) -> usize {
        let mut best_idx = rng.gen_range(0, scores.len());
        for _ in 0..2 {
            let candidate = rng.gen_range(0, scores.len());
            if scores[candidate] > scores[best_idx] {
                best_idx = candidate;
            }
        }
        best_idx
    }

    // Crossover : combine 2 grilles en respectant les symétries
    fn crossover(&self, hl: &mut HashLife, a: usize, b: usize, rng: &mut Rng) -> usize {
        let mut grid_a = [[0; SIZE]; SIZE];
        let mut grid_b = [[0; SIZE]; SIZE];
        let mut ctx_a = GridContext { hl, grid: &mut grid_a };
        let mut ctx_b = GridContext { hl, grid: &mut grid_b };
        ctx_a.fill(FillArgs { node: a, level: 5, pos: (0, 0) });
        ctx_b.fill(FillArgs { node: b, level: 5, pos: (0, 0) });

        let mut child_grid = [[0; SIZE]; SIZE];
        for y in 0..SIZE {
            for x in 0..SIZE {
                // Choisit aléatoirement entre a et b, mais en respectant les symétries
                if rng.gen_float() < 0.5 {
                    child_grid[y][x] = grid_a[y][x];
                } else {
                    child_grid[y][x] = grid_b[y][x];
                }
            }
        }

        // Applique la canonicalisation pour garantir la validité
        let canon = canonical(&child_grid);
        hl.build_tree(BuildArgs { grid: &canon, level: 5, pos: (0, 0) })
    }

    // Mutation ciblée (priorité aux zones stables)
    fn mutate(&self, hl: &mut HashLife, root: usize, rng: &mut Rng) -> usize {
        let mut grid = [[0; SIZE]; SIZE];
        let mut ctx = GridContext { hl, grid: &mut grid };
        ctx.fill(FillArgs { node: root, level: 5, pos: (0, 0) });

        // Trouve les cellules stables (2 ou 3 voisins)
        let mut stable_cells = Vec::new();
        for y in 0..SIZE {
            for x in 0..SIZE {
                if grid[y][x] == 1 {
                    let neighbors = count_neighbors(&grid, (x, y));
                    if neighbors == 2 || neighbors == 3 {
                        stable_cells.push((x, y));
                    }
                }
            }
        }

        // Mutate une cellule stable ou aléatoire
        let (mx, my) = if !stable_cells.is_empty() && rng.gen_float() < 0.7 {
            let idx = rng.gen_range(0, stable_cells.len());
            stable_cells[idx]
        } else {
            let x = rng.gen_range(0, SIZE);
            let y = rng.gen_range(0, SIZE);
            (x, y)
        };

        grid[my][mx] ^= 1; // Inverse la cellule
        let canon = canonical(&grid);
        hl.build_tree(BuildArgs { grid: &canon, level: 5, pos: (0, 0) })
    }
}
