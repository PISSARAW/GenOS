const { init } = require('z3-solver');
const fs = require('fs');

const SIZE = 20;
const STEPS = 5;

const OFFSETS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
];

function createGrid(Z3, t) {
    const grid = [];
    for (let y = 0; y < SIZE; y++) {
        const row = [];
        for (let x = 0; x < SIZE; x++) {
            row.push(Z3.Bool.const(`B_${t}_${y}_${x}`));
        }
        grid.push(row);
    }
    return grid;
}

function sumNeighbors(Z3, grid, pos) {
    const {y, x} = pos;
    let sum = null;
    for (const off of OFFSETS) {
        const ny = y + off[0];
        const nx = x + off[1];
        if (ny >= 0 && ny < SIZE && nx >= 0 && nx < SIZE) {
            const val = Z3.If(grid[ny][nx], Z3.Int.val(1), Z3.Int.val(0));
            if (sum === null) sum = val;
            else sum = sum.add(val);
        }
    }
    return sum || Z3.Int.val(0);
}

function applyRulesForCell(Z3, solver, cellData) {
    const { s, cell, nextCell } = cellData;
    const survives = Z3.And(cell, Z3.Or(s.eq(2), s.eq(3)));
    const born = Z3.And(Z3.Not(cell), s.eq(3));
    solver.add(nextCell.eq(Z3.Or(survives, born)));
}

function addRules(Z3, solver, grids) {
    for (let t = 0; t < STEPS; t++) {
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const s = sumNeighbors(Z3, grids[t], {y, x});
                const cell = grids[t][y][x];
                const nextCell = grids[t+1][y][x];
                applyRulesForCell(Z3, solver, { s, cell, nextCell });
            }
        }
    }
}

function applyTarget(Z3, solver, data) {
    const {grid, lines} = data;
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const char = lines[y][x];
            const isAlive = (char === '1' || char === 'O' || char === '*');
            solver.add(grid[y][x].eq(Z3.Bool.val(isAlive)));
        }
    }
}

function saveSolution(model, gen0Grid) {
    const lines = [];
    for (let y = 0; y < SIZE; y++) {
        let rowStr = '';
        for (let x = 0; x < SIZE; x++) {
            const val = model.eval(gen0Grid[y][x]);
            rowStr += (val.sexpr() === 'true') ? '1' : '0';
        }
        lines.push(rowStr);
    }
    fs.writeFileSync('results/gen0_sat.txt', lines.join('\n'));
    console.log("Solution saved to gen0_sat.txt");
}

async function solve() {
    const { Context } = await init();
    const Z3 = new Context('main');
    
    const solver = new Z3.Solver();
    solver.set('timeout', 30000);

    const targetGridPath = 'data/target_grid.txt';
    if (!fs.existsSync(targetGridPath)) {
        console.error(`File target_grid.txt not found`);
        process.exit(1);
    }
    
    const content = fs.readFileSync(targetGridPath, 'utf8');
    const lines = content.trim().split(/\r?\n/).map(l => l.trim());

    const grids = [];
    for (let t = 0; t <= STEPS; t++) {
        grids.push(createGrid(Z3, t));
    }

    applyTarget(Z3, solver, {grid: grids[STEPS], lines});
    addRules(Z3, solver, grids);

    console.log("Solving...");
    const res = await solver.check();
    
    if (res === 'sat') {
        const model = solver.model();
        saveSolution(model, grids[0]);
    } else {
        console.log(`No solution found: ${res}`);
    }
}

solve().catch(console.error);
