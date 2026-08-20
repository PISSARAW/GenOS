const fs = require('fs');

const SIZE = 20;

function readGrid(filename) {
    const text = fs.readFileSync(filename, 'utf-8');
    const grid = new Int8Array(SIZE * SIZE);
    let i = 0;
    for (let char of text) {
        if (char === '0' || char === '1') {
            grid[i++] = parseInt(char, 10);
        }
    }
    return grid;
}

function writeGrid(filename, grid) {
    let text = '';
    for (let i = 0; i < SIZE * SIZE; i++) {
        text += grid[i].toString();
        if ((i + 1) % SIZE === 0) text += '\n';
    }
    fs.writeFileSync(filename, text, 'utf-8');
}

function computeNextGen(grid, nextGrid) {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            let count = 0;
            // Toroidal boundaries
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    let nx = (x + dx + SIZE) % SIZE;
                    let ny = (y + dy + SIZE) % SIZE;
                    count += grid[ny * SIZE + nx];
                }
            }
            let idx = y * SIZE + x;
            if (grid[idx]) {
                nextGrid[idx] = (count === 2 || count === 3) ? 1 : 0;
            } else {
                nextGrid[idx] = (count === 3) ? 1 : 0;
            }
        }
    }
}

function calculateDistance(candidate, target, tmp1, tmp2) {
    let curr = candidate;
    let next = tmp1;
    for (let i = 0; i < 5; i++) {
        computeNextGen(curr, next);
        let t = curr; curr = next; next = (curr === tmp1 ? tmp2 : tmp1);
    }
    let dist = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
        if (curr[i] !== target[i]) dist++;
    }
    return dist;
}

function solveQISCA(targetGrid, timeLimitMs) {
    const startTime = Date.now();
    let current = new Int8Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
        current[i] = Math.random() < 0.2 ? 1 : 0;
    }
    let tmp1 = new Int8Array(SIZE * SIZE);
    let tmp2 = new Int8Array(SIZE * SIZE);
    
    let currentDist = calculateDistance(current, targetGrid, tmp1, tmp2);
    let best = new Int8Array(current);
    let bestDist = currentDist;
    
    let T = 100.0;
    const coolingRate = 0.99995;
    
    let iterations = 0;
    while (Date.now() - startTime < timeLimitMs) {
        iterations++;
        // mutate: Quantum superposition bit-flip
        let flips = Math.floor(Math.random() * 4) + 1;
        let indices = [];
        for (let i = 0; i < flips; i++) {
            let idx = Math.floor(Math.random() * (SIZE * SIZE));
            indices.push(idx);
            current[idx] = 1 - current[idx];
        }
        
        let newDist = calculateDistance(current, targetGrid, tmp1, tmp2);
        
        if (newDist < currentDist || Math.random() < Math.exp((currentDist - newDist) / T)) {
            currentDist = newDist;
            if (currentDist < bestDist) {
                bestDist = currentDist;
                best.set(current);
                if (bestDist === 0) {
                    console.log(`Perfect solution found at iteration ${iterations}!`);
                    break;
                }
            }
        } else {
            // collapse state
            for (let idx of indices) {
                current[idx] = 1 - current[idx];
            }
        }
        
        T *= coolingRate;
        if (T < 0.001) T = 50.0; // reheat phase
    }
    
    console.log(`QISCA Finished. Iterations: ${iterations}, Best Hamming Distance: ${bestDist}`);
    return best;
}

function main() {
    const target = readGrid('target_grid.txt');
    console.log('Starting QISCA solver for 28 seconds...');
    const best = solveQISCA(target, 5000);
    writeGrid('gen0_qisca.txt', best);
}
main();
