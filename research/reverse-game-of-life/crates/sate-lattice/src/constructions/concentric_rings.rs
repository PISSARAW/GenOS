use std::cmp::min;
use crate::scorer::Scorer;

pub fn generate_concentric_rings(n: usize) -> Scorer {
    let mut grid = vec![vec![false; n]; n];

    for y in 0..n {
        for x in 0..n {
            let dist_x = min(x, n - 1 - x);
            let dist_y = min(y, n - 1 - y);
            let r = min(dist_x, dist_y);
            
            // Un anneau plein (pair), un anneau vide (impair)
            if r % 2 == 0 {
                grid[y][x] = true;
            }
        }
    }

    Scorer::new(n, n, grid)
}
