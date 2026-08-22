const fs = require('fs');

const SIZE = 20;

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

function parseGrid(text) {
    let grid = createEmptyGrid();
    let lines = text.trim().split(/\r?\n/);
    for (let y = 0; y < SIZE && y < lines.length; y++) {
        for (let x = 0; x < SIZE && x < lines[y].length; x++) {
            grid[y][x] = (lines[y][x] === '1') ? 1 : 0;
        }
    }
    return grid;
}

function compareGrids(g1, g2) {
    let diffs = 0;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (g1[y][x] !== g2[y][x]) diffs++;
        }
    }
    return diffs;
}

function main() {
    if (process.argv.length < 3) {
        console.error("Usage: node rgol_evaluator.js <candidate_gen0.txt>");
        process.exit(1);
    }
    
    let candidateFile = process.argv[2];
    if (!fs.existsSync(candidateFile)) {
        console.error("Candidate file not found");
        process.exit(1);
    }
    
    let targetText = fs.readFileSync('data/target_grid.txt', 'utf8');
    let candidateText = fs.readFileSync(candidateFile, 'utf8');
    
    let targetGrid = parseGrid(targetText);
    let candidateGrid = parseGrid(candidateText);
    
    let currentGrid = candidateGrid;
    for(let i=0; i<5; i++) {
        currentGrid = nextGeneration(currentGrid);
    }
    
    let diffs = compareGrids(currentGrid, targetGrid);
    console.log(`Differences after 5 generations: ${diffs}`);
    let accuracy = ((SIZE*SIZE - diffs) / (SIZE*SIZE)) * 100;
    console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
}

main();
