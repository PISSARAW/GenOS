use crate::scorer::Scorer;
use std::fs;

pub fn read_witness(filepath: &str) -> Scorer {
    let content = fs::read_to_string(filepath).expect("Unable to read witness file");
    let mut grid = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let row: Vec<bool> = line.chars().map(|c| c == '#' || c == '1').collect();
        grid.push(row);
    }

    let height = grid.len();
    let width = if height > 0 { grid[0].len() } else { 0 };

    Scorer::new(width, height, grid)
}

pub fn write_witness(filepath: &str, scorer: &Scorer) {
    let mut content = String::new();
    for y in 0..scorer.height {
        for x in 0..scorer.width {
            content.push(if scorer.grid[y][x] { '#' } else { '.' });
        }
        content.push('\n');
    }
    fs::write(filepath, content).expect("Unable to write witness file");
}
