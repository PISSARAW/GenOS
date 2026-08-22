const fs = require('fs');

const WIDTH = 20;
const HEIGHT = 20;
const TIMEOUT_MS = 29500;

let bestIndex = -1;
let bestG0 = new Uint8Array(WIDTH * HEIGHT);
let targetGrid = [];
let determinedCells = Array.from({ length: WIDTH * HEIGHT }, () => []);
let startTime = 0;
let isTimeout = false;

let buf11 = new Uint8Array(11 * 11);
let buf9 = new Uint8Array(9 * 9);
let buf7 = new Uint8Array(7 * 7);
let buf5 = new Uint8Array(5 * 5);
let buf3 = new Uint8Array(3 * 3);
let buf1 = new Uint8Array(1 * 1);

function loadTargetGrid(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`File ${filePath} not found. Using empty grid.`);
        return Array.from({ length: HEIGHT }, () => new Array(WIDTH).fill(0));
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    return lines.map(line => line.trim().split('').map(Number));
}

function initDeterminedCells() {
    for (let x = 0; x < HEIGHT; x++) {
        for (let y = 0; y < WIDTH; y++) {
            let rMax = Math.min(HEIGHT - 1, x + 5);
            let cMax = Math.min(WIDTH - 1, y + 5);
            let index = rMax * WIDTH + cMax;
            determinedCells[index].push({ x, y });
        }
    }
}

function populateInitialWindow(x, y, G0) {
    for (let i = 0; i < 11; i++) {
        let r = x - 5 + i;
        for (let j = 0; j < 11; j++) {
            let c = y - 5 + j;
            if (r >= 0 && r < HEIGHT && c >= 0 && c < WIDTH) {
                buf11[i * 11 + j] = G0[r * WIDTH + c];
            } else {
                buf11[i * 11 + j] = 0;
            }
        }
    }
}

function stepWindow(curr, size, next) {
    let nextSize = size - 2;
    for (let i = 0; i < nextSize; i++) {
        for (let j = 0; j < nextSize; j++) {
            let r = i + 1;
            let c = j + 1;
            let count = curr[(r-1)*size + (c-1)] + curr[(r-1)*size + c] + curr[(r-1)*size + (c+1)] +
                        curr[r*size + (c-1)]                        + curr[r*size + (c+1)] +
                        curr[(r+1)*size + (c-1)] + curr[(r+1)*size + c] + curr[(r+1)*size + (c+1)];
            let cell = curr[r*size + c];
            next[i*nextSize + j] = (count === 3 || (count === 2 && cell === 1)) ? 1 : 0;
        }
    }
}

function simulateLocal(x, y, G0) {
    populateInitialWindow(x, y, G0);
    stepWindow(buf11, 11, buf9);
    stepWindow(buf9, 9, buf7);
    stepWindow(buf7, 7, buf5);
    stepWindow(buf5, 5, buf3);
    stepWindow(buf3, 3, buf1);
    return buf1[0];
}

function checkDeterminedCells(index, G0) {
    let cells = determinedCells[index];
    for (let k = 0; k < cells.length; k++) {
        let cell = cells[k];
        let res = simulateLocal(cell.x, cell.y, G0);
        if (res !== targetGrid[cell.x][cell.y]) {
            return false;
        }
    }
    return true;
}

function updateBest(index, G0) {
    if (index > bestIndex) {
        bestIndex = index;
        bestG0.set(G0);
    }
}

function backtrack(index, G0) {
    if (Date.now() - startTime > TIMEOUT_MS) {
        isTimeout = true;
        return false;
    }
    
    if (index === WIDTH * HEIGHT) {
        return true;
    }

    updateBest(index, G0);

    for (let val = 0; val <= 1; val++) {
        G0[index] = val;
        let isValid = checkDeterminedCells(index, G0);
        
        if (isValid) {
            if (backtrack(index + 1, G0)) {
                return true;
            }
        }
        if (isTimeout) return false;
    }
    
    G0[index] = 0;
    return false;
}

function formatGrid(G0) {
    let lines = [];
    for (let r = 0; r < HEIGHT; r++) {
        let line = '';
        for (let c = 0; c < WIDTH; c++) {
            line += G0[r * WIDTH + c];
        }
        lines.push(line);
    }
    return lines.join('\n');
}

function saveResult(G0, filepath) {
    fs.writeFileSync(filepath, formatGrid(G0), 'utf-8');
}

function main() {
    startTime = Date.now();
    targetGrid = loadTargetGrid('data/target_grid.txt');
    initDeterminedCells();
    
    let G0 = new Uint8Array(WIDTH * HEIGHT);
    
    let found = backtrack(0, G0);
    
    if (found) {
        console.log("Solution exacte trouvee.");
        saveResult(G0, 'results/gen0_backtrack.txt');
    } else {
        console.log("Fin du temps ou aucune solution. Sauvegarde de la meilleure approximation.");
        saveResult(bestG0, 'results/gen0_backtrack.txt');
    }
}

main();
