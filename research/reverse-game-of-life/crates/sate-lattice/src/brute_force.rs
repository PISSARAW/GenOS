use crate::scorer::{ScoreResult, Scorer};

pub fn brute_force_exact(n: usize) -> (Scorer, ScoreResult) {
    let mut best_score = -1;
    let mut best_grid = vec![vec![false; n]; n];
    let mut best_result = ScoreResult {
        alive: 0,
        overloaded: 0,
        soft_score: 0,
        is_valid_strict: false,
    };

    let total_cells = n * n;
    let max_mask = 1u64 << total_cells;

    for mask in 0..max_mask {
        let mut grid = vec![vec![false; n]; n];
        for i in 0..total_cells {
            if (mask & (1 << i)) != 0 {
                let x = i % n;
                let y = i / n;
                grid[y][x] = true;
            }
        }

        let scorer = Scorer::new(n, n, grid.clone());
        let result = scorer.evaluate();

        if result.soft_score > best_score {
            best_score = result.soft_score;
            best_grid = grid;
            best_result = result;
        }
    }

    (Scorer::new(n, n, best_grid), best_result)
}
