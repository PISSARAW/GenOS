const fs = require('fs');

const SIZE = 20;
const GENERATIONS = 5;

function createEmptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function countNeighbors(grid, x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            let nx = (x + dx + SIZE) % SIZE;
            let ny = (y + dy + SIZE) % SIZE;
            count += grid[ny][nx];
        }
    }
    return count;
}

function nextGeneration(grid) {
    let nextGrid = createEmptyGrid();
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let neighbors = countNeighbors(grid, x, y);
            if (grid[y][x] === 1) {
                nextGrid[y][x] = (neighbors === 2 || neighbors === 3) ? 1 : 0;
            } else {
                nextGrid[y][x] = (neighbors === 3) ? 1 : 0;
            }
        }
    }
    return nextGrid;
}

function printGrid(grid) {
    return grid.map(row => row.join('')).join('\n');
}

// Generate random gen 0
let currentGrid = createEmptyGrid();
for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
        currentGrid[y][x] = Math.random() < 0.3 ? 1 : 0;
    }
}

fs.writeFileSync('results/gen0_secret.txt', printGrid(currentGrid));

// Evolve 5 generations
for (let i = 0; i < GENERATIONS; i++) {
    currentGrid = nextGeneration(currentGrid);
}

fs.writeFileSync('data/target_grid.txt', printGrid(currentGrid));
console.log('Grids generated: data/target_grid.txt (Gen 5) and results/gen0_secret.txt (Gen 0)');
