use crate::scorer::Scorer;
use std::cmp::min;

pub fn generate_concentric_rings(n: usize) -> Scorer {
    let mut grid = vec![vec![false; n]; n];

    for (y, row) in grid.iter_mut().enumerate() {
        for (x, cell) in row.iter_mut().enumerate() {
            let dist_x = min(x, n - 1 - x);
            let dist_y = min(y, n - 1 - y);
            let r = min(dist_x, dist_y);

            // Un anneau plein (pair), un anneau vide (impair)
            if r % 2 == 0 {
                *cell = true;
            }
        }
    }

    Scorer::new(n, n, grid)
}
