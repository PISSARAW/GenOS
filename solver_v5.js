const fs = require('fs');

let targetGrid = new Int8Array(400);
let bestDist = 400;
let bestGrid = new Int8Array(400);
let calls = 0;
let pruned = 0;
let startTime = 0;
const TIMEOUT = 29500;
let isTimeout = false;
let neighborsList = [];

let tmpG1 = new Int8Array(400);
let tmpG2 = new Int8Array(400);
let tmp3G1 = new Int8Array(400);
let tmp3G2 = new Int8Array(400);

function getNeighborsFor(x, y) {
    let list = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            let nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < 20 && ny >= 0 && ny < 20) {
                list.push(ny * 20 + nx);
            }
        }
    }
    return new Int16Array(list);
}

function initNeighbors() {
    for (let i = 0; i < 400; i++) {
        neighborsList.push(getNeighborsFor(i % 20, Math.floor(i / 20)));
    }
}

function loadTarget() {
    let text = fs.readFileSync('C:/Users/Shadow/.gemini/antigravity/brain/4110adbb-bd7b-49de-b3f1-06b30e4facb9/.system_generated/worktrees/subagent-Gen-5-Engineer-self-c4eed765/target_grid.txt', 'utf-8');
    let lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
            targetGrid[y * 20 + x] = parseInt(lines[y][x], 10);
        }
    }
}

function saveGen0() {
    let out = [];
    for (let y = 0; y < 20; y++) {
        let row = [];
        for (let x = 0; x < 20; x++) {
            let val = bestGrid[y * 20 + x];
            row.push(val === 2 ? 0 : val);
        }
        out.push(row.join(''));
    }
    fs.writeFileSync('C:/Users/Shadow/.gemini/antigravity/brain/4110adbb-bd7b-49de-b3f1-06b30e4facb9/.system_generated/worktrees/subagent-Gen-5-Engineer-self-c4eed765/gen0_v5.txt', out.join('\n'));
}

function getNextCell(c, c1, c2) {
    let sumMax = c1 + c2;
    let limit = c === 0 ? 3 : 2;
    let canA = (c1 <= 3 && sumMax >= limit);
    let canD = (c === 2) ? !(c1 === 3 && sumMax === 3) : (c1 < limit || sumMax > 3);
    return (canA && canD) ? 2 : (canA ? 1 : 0);
}

function project5(grid) {
    for (let i = 0; i < 400; i++) tmp3G1[i] = grid[i];
    let curr = tmp3G1;
    let next = tmp3G2;
    for (let step = 0; step < 5; step++) {
        for (let i = 0; i < 400; i++) {
            let nList = neighborsList[i];
            let c1 = 0, c2 = 0;
            let len = nList.length;
            for (let j = 0; j < len; j++) {
                let st = curr[nList[j]];
                if (st === 1) c1++;
                else if (st === 2) c2++;
            }
            next[i] = getNextCell(curr[i], c1, c2);
        }
        let t = curr; curr = next; next = t;
    }
    return curr;
}

function checkPrune(proj) {
    for (let i = 0; i < 400; i++) {
        let p = proj[i];
        if (p !== 2 && p !== targetGrid[i]) return true;
    }
    return false;
}

function projectRealAndGetHamming(grid) {
    for (let i = 0; i < 400; i++) tmpG1[i] = grid[i] === 2 ? 0 : grid[i];
    
    let curr = tmpG1;
    let next = tmpG2;
    for (let step = 0; step < 5; step++) {
        for (let i = 0; i < 400; i++) {
            let nList = neighborsList[i];
            let ones = 0;
            let len = nList.length;
            for (let j = 0; j < len; j++) {
                if (curr[nList[j]] === 1) ones++;
            }
            if (curr[i] === 1) next[i] = (ones === 2 || ones === 3) ? 1 : 0;
            else next[i] = (ones === 3) ? 1 : 0;
        }
        let t = curr; curr = next; next = t;
    }
    
    let dist = 0;
    for (let i = 0; i < 400; i++) {
        if (curr[i] !== targetGrid[i]) dist++;
    }
    return dist;
}

function getVarsCenterOut() {
    let vars = [];
    for (let i = 0; i < 400; i++) {
        let x = i % 20;
        let y = Math.floor(i / 20);
        let dist = Math.hypot(x - 9.5, y - 9.5);
        vars.push({ i, dist });
    }
    vars.sort((a, b) => a.dist - b.dist);
    return new Int16Array(vars.map(v => v.i));
}

function solveDFS(grid, varIdx, varsOrder) {
    calls++;
    if (calls % 1000 === 0 && Date.now() - startTime > TIMEOUT) {
        isTimeout = true;
        return true;
    }

    let proj = project5(grid);
    if (checkPrune(proj)) {
        pruned++;
        return false;
    }

    let realDist = projectRealAndGetHamming(grid);
    if (realDist < bestDist) {
        bestDist = realDist;
        bestGrid.set(grid);
        if (bestDist === 0 && varIdx === 400) return true;
    }

    if (varIdx === 400) return false;

    let idx = varsOrder[varIdx];
    
    grid[idx] = 0;
    if (solveDFS(grid, varIdx + 1, varsOrder)) return true;
    if (isTimeout) return true;
    
    grid[idx] = 1;
    if (solveDFS(grid, varIdx + 1, varsOrder)) return true;
    if (isTimeout) return true;
    
    grid[idx] = 2; // backtrack
    return false;
}

function main() {
    initNeighbors();
    loadTarget();
    let varsOrder = getVarsCenterOut();
    let initialGrid = new Int8Array(400).fill(2);
    bestGrid.fill(2);
    
    startTime = Date.now();
    solveDFS(initialGrid, 0, varsOrder);
    let timeSec = (Date.now() - startTime) / 1000;
    if (timeSec === 0) timeSec = 0.001;
    
    console.log(`Calls: ${calls}`);
    console.log(`Pruned: ${pruned}`);
    console.log(`Nodes/sec: ${Math.floor(calls / timeSec)}`);
    console.log(`Best Hamming: ${bestDist}`);
    
    saveGen0();
}

main();
