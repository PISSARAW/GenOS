const fs = require('fs');

const SIZE = 20;

const NEIGHBOR_OFFSETS = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1]
];

function countNeighbors(grid, idx) {
    const x = idx % SIZE;
    const y = Math.floor(idx / SIZE);
    let count = 0;
    for (let offset of NEIGHBOR_OFFSETS) {
        const nx = x + offset[0];
        const ny = y + offset[1];
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
            count += grid[ny * SIZE + nx];
        }
    }
    return count;
}

function getNextCell(grid, i) {
    const alive = grid[i];
    const neighbors = countNeighbors(grid, i);
    if (alive && (neighbors === 2 || neighbors === 3)) return 1;
    if (!alive && neighbors === 3) return 1;
    return 0;
}

function nextGeneration(grid) {
    return grid.map((_, i) => getNextCell(grid, i));
}

function calculateFitness(target, candidate) {
    let grid = candidate;
    for (let i = 0; i < 5; i++) {
        grid = nextGeneration(grid);
    }
    let score = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
        if (grid[i] === target[i]) {
            score++;
        }
    }
    return score;
}

function createIndividual() {
    const ind = new Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
        ind[i] = Math.random() > 0.5 ? 1 : 0;
    }
    return ind;
}

function initPopulation(popSize) {
    const pop = [];
    for (let i = 0; i < popSize; i++) {
        pop.push(createIndividual());
    }
    return pop;
}

function crossover(parent1, parent2) {
    const child = new Array(SIZE * SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
        child[i] = Math.random() > 0.5 ? parent1[i] : parent2[i];
    }
    return child;
}

function mutate(individual, rate) {
    for (let i = 0; i < SIZE * SIZE; i++) {
        if (Math.random() < rate) {
            individual[i] = 1 - individual[i];
        }
    }
    return individual;
}

function getTournamentWinner(pop, scores) {
    const i1 = Math.floor(Math.random() * pop.length);
    const i2 = Math.floor(Math.random() * pop.length);
    return scores[i1] > scores[i2] ? pop[i1] : pop[i2];
}

function findBestInGeneration(pop, scores) {
    let bestScore = -1;
    let bestInd = null;
    for (let i = 0; i < pop.length; i++) {
        if (scores[i] > bestScore) {
            bestScore = scores[i];
            bestInd = pop[i];
        }
    }
    return { bestScore, bestInd };
}

function nextPopulation(pop, scores, mutationRate) {
    const newPop = [];
    const { bestInd } = findBestInGeneration(pop, scores);
    newPop.push(bestInd);
    
    while (newPop.length < pop.length) {
        const p1 = getTournamentWinner(pop, scores);
        const p2 = getTournamentWinner(pop, scores);
        let child = crossover(p1, p2);
        child = mutate(child, mutationRate);
        newPop.push(child);
    }
    return newPop;
}

function readGrid(filename) {
    const text = fs.readFileSync(filename, 'utf-8');
    const grid = [];
    for (let char of text) {
        if (char === '0' || char === '1') {
            grid.push(parseInt(char, 10));
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

function runGA(targetGrid, timeLimitMs) {
    const startTime = Date.now();
    let pop = initPopulation(200);
    let overallBest = null;
    let overallBestScore = -1;

    while (Date.now() - startTime < timeLimitMs) {
        const scores = pop.map(ind => calculateFitness(targetGrid, ind));
        const { bestScore, bestInd } = findBestInGeneration(pop, scores);
        
        if (bestScore > overallBestScore) {
            overallBestScore = bestScore;
            overallBest = bestInd;
            console.log(`New best score: ${overallBestScore} / ${SIZE * SIZE}`);
        }
        
        if (overallBestScore === SIZE * SIZE) break;
        pop = nextPopulation(pop, scores, 0.05);
    }
    return overallBest;
}

function main() {
    try {
        const target = readGrid('data/target_grid.txt');
        if (target.length !== 400) {
            console.error('target_grid.txt must contain 400 binary digits (20x20).');
            return;
        }
        console.log('Starting GA for 29.5 seconds...');
        const best = runGA(target, 29500);
        writeGrid('results/gen0_ga.txt', best);
        console.log('Saved best generation 0 to gen0_ga.txt');
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
