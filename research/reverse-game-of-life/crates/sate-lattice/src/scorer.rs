pub struct Scorer {
    pub width: usize,
    pub height: usize,
    pub grid: Vec<Vec<bool>>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct ScoreResult {
    pub alive: usize,
    pub overloaded: usize,
    pub soft_score: i32,
    pub is_valid_strict: bool,
}

impl Scorer {
    pub fn new(width: usize, height: usize, grid: Vec<Vec<bool>>) -> Self {
        Scorer { width, height, grid }
    }

    pub fn get_degree(&self, x: usize, y: usize) -> usize {
        if !self.grid[y][x] {
            return 0;
        }

        let mut degree = 0;
        let dirs = [
            (-1, -1), (0, -1), (1, -1),
            (-1,  0),          (1,  0),
            (-1,  1), (0,  1), (1,  1),
        ];

        for (dx, dy) in dirs.iter() {
            let nx = x as isize + dx;
            let ny = y as isize + dy;
            if self.is_valid_coord(nx, ny) && self.grid[ny as usize][nx as usize] {
                degree += 1;
            }
        }
        degree
    }

    fn is_valid_coord(&self, x: isize, y: isize) -> bool {
        x >= 0 && y >= 0 && x < self.width as isize && y < self.height as isize
    }

    pub fn evaluate(&self) -> ScoreResult {
        let mut alive = 0;
        let mut overloaded = 0;

        for y in 0..self.height {
            for x in 0..self.width {
                if self.grid[y][x] {
                    alive += 1;
                    if self.get_degree(x, y) > 3 {
                        overloaded += 1;
                    }
                }
            }
        }

        let soft_score = alive as i32 - 2 * overloaded as i32;
        let is_valid_strict = overloaded == 0;

        ScoreResult {
            alive,
            overloaded,
            soft_score,
            is_valid_strict,
        }
    }
}
