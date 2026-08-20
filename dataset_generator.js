const fs = require('fs');

const SIZE = 20;

function getNeighbors(grid, x, y) {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            let nx = x + dx;
            let ny = y + dy;
            if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
                count += grid[ny][nx];
            }
        }
    }
    return count;
}

function computeFitness(grid) {
    let score = 0;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (grid[y][x] === 1) {
                score += 1;
                if (getNeighbors(grid, x, y) > 3) {
                    score -= 2;
                }
            }
        }
    }
    return score;
}

function main() {
    let dataset = [];
    for (let i = 0; i < 100000; i++) {
        let grid = [];
        for (let y = 0; y < SIZE; y++) {
            let row = [];
            for (let x = 0; x < SIZE; x++) {
                row.push(Math.random() < 0.25 ? 1 : 0);
            }
            grid.push(row);
        }
        
        let score = computeFitness(grid);
        let val = 1.0 / (1.0 + Math.exp(-(score - 180.0) / 10.0));
        
        dataset.push({
            grid: grid,
            Value: parseFloat(val.toFixed(6))
        });
    }
    
    fs.writeFileSync('dataset_rgol.json', JSON.stringify(dataset));
    console.log(`Volume du dataset généré : ${dataset.length} configurations`);
}

main();
