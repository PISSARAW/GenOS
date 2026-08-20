const fs = require('fs');

const SIZE = 20;
const N_OFFSETS = [[-1,-1], [0,-1], [1,-1], [-1,0], [1,0], [-1,1], [0,1], [1,1]];

function countNeighbors(grid, idx) {
    const x = idx % SIZE;
    const y = Math.floor(idx / SIZE);
    let count = 0;
    for (let o of N_OFFSETS) {
        const nx = x + o[0], ny = y + o[1];
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
            count += grid[ny * SIZE + nx];
        }
    }
    return count;
}

function getNextCell(alive, neighbors) {
    if (alive && (neighbors === 2 || neighbors === 3)) return 1;
    if (!alive && neighbors === 3) return 1;
    return 0;
}

function nextGen(grid) {
    return grid.map((val, i) => getNextCell(val, countNeighbors(grid, i)));
}

function evalFitness(target, candidate) {
    let grid = candidate;
    let stable = new Array(SIZE * SIZE).fill(1);
    for (let i = 0; i < 5; i++) {
        let nxt = nextGen(grid);
        for(let j=0; j<400; j++) {
            if (grid[j] !== nxt[j]) stable[j] = 0;
        }
        grid = nxt;
    }
    let score = 0;
    for (let i = 0; i < 400; i++) {
        if (grid[i] === target[i]) score++;
    }
    return { score, stable };
}

function initPop(popSize) {
    const pop = [];
    for (let i = 0; i < popSize; i++) {
        const ind = new Array(400);
        for (let j = 0; j < 400; j++) ind[j] = Math.random() > 0.5 ? 1 : 0;
        pop.push(ind);
    }
    return pop;
}

function symCrossover(p1, p2) {
    const child = new Array(400);
    const symType = Math.floor(Math.random() * 3);
    for (let i = 0; i < 400; i++) {
        const x = i % SIZE, y = Math.floor(i / SIZE);
        let fromP1 = false;
        if (symType === 0) fromP1 = (y < SIZE / 2);
        else if (symType === 1) fromP1 = (x < SIZE / 2);
        else fromP1 = ((x < SIZE/2) === (y < SIZE/2));
        
        child[i] = fromP1 ? p1[i] : p2[i];
    }
    return child;
}

function targetedMutate(ind, stable) {
    const child = [...ind];
    for (let i = 0; i < 400; i++) {
        let rate = stable[i] ? 0.05 : 0.01;
        if (Math.random() < rate) {
            child[i] = 1 - child[i];
        }
    }
    return child;
}

function tournament(pop, scores) {
    let best = Math.floor(Math.random() * pop.length);
    for (let i = 0; i < 2; i++) {
        let r = Math.floor(Math.random() * pop.length);
        if (scores[r].score > scores[best].score) best = r;
    }
    return { ind: pop[best], stable: scores[best].stable };
}

function getBest(pop, scores) {
    let bestScore = -1, bestInd = null;
    for (let i = 0; i < pop.length; i++) {
        if (scores[i].score > bestScore) {
            bestScore = scores[i].score;
            bestInd = pop[i];
        }
    }
    return { bestScore, bestInd };
}

function nextPop(pop, scores) {
    const newPop = [];
    const { bestInd } = getBest(pop, scores);
    newPop.push(bestInd);
    
    while (newPop.length < pop.length) {
        const p1 = tournament(pop, scores);
        const p2 = tournament(pop, scores);
        let child = symCrossover(p1.ind, p2.ind);
        
        let childStable = new Array(400);
        for(let i=0; i<400; i++) childStable[i] = p1.stable[i] && p2.stable[i];
        
        child = targetedMutate(child, childStable);
        newPop.push(child);
    }
    return newPop;
}

function runGAV2(target) {
    const startTime = Date.now();
    let pop = initPop(200);
    let overallBest = null, overallBestScore = -1;

    while (Date.now() - startTime < 30000) {
        const scores = pop.map(ind => evalFitness(target, ind));
        const { bestScore, bestInd } = getBest(pop, scores);
        
        if (bestScore > overallBestScore) {
            overallBestScore = bestScore;
            overallBest = bestInd;
            console.log(`New best score: ${overallBestScore} / 400`);
        }
        if (overallBestScore === 400) break;
        pop = nextPop(pop, scores);
    }
    return { overallBest, overallBestScore };
}

function main() {
    const text = fs.readFileSync('target_grid.txt', 'utf-8');
    const target = [];
    for (let c of text) {
        if (c === '0' || c === '1') target.push(parseInt(c, 10));
    }
    console.log('Starting GA V2 for 30 seconds...');
    const { overallBest, overallBestScore } = runGAV2(target);
    console.log(`\nSimulation terminee.`);
    console.log(`Score final (Evolution Darwinienne) : ${overallBestScore}`);
    
    let textOut = '';
    for (let i = 0; i < 400; i++) {
        textOut += overallBest[i].toString();
        if ((i + 1) % 20 === 0) textOut += '\n';
    }
    fs.writeFileSync('gen0_ga_v2.txt', textOut, 'utf-8');
}
main();
