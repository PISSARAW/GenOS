const fs = require('fs');

function countRowBits(row, c) {
  let n = 0;
  if (c > 0) n += (row >> (c - 1)) & 1;
  n += (row >> c) & 1;
  if (c < 19) n += (row >> (c + 1)) & 1;
  return n;
}

function getNeighbors(grid, r, c) {
  let n = 0;
  if (r > 0) n += countRowBits(grid[r - 1], c);
  n += countRowBits(grid[r], c) - ((grid[r] >> c) & 1);
  if (r < 19) n += countRowBits(grid[r + 1], c);
  return n;
}

function nextCellState(grid, r, c) {
  let alive = (grid[r] >> c) & 1;
  let n = getNeighbors(grid, r, c);
  return (n === 3 || (alive && n === 2)) ? 1 : 0;
}

function nextGenRow(grid, r) {
  let newRow = 0;
  for (let c = 0; c < 20; c++) {
    newRow |= (nextCellState(grid, r, c) << c);
  }
  return newRow;
}

function nextGen(grid) {
  let next = new Int32Array(20);
  for (let r = 0; r < 20; r++) {
    next[r] = nextGenRow(grid, r);
  }
  return next;
}

function simulate5(grid) {
  let g = grid;
  for (let i = 0; i < 5; i++) g = nextGen(g);
  return g;
}

function getSpiralOrder() {
  let cells = [];
  for (let r = 0; r < 20; r++) {
    for (let c = 0; c < 20; c++) {
      let d = Math.max(Math.abs(r - 9.5), Math.abs(c - 9.5));
      cells.push({ r, c, d });
    }
  }
  cells.sort((a, b) => a.d - b.d);
  return cells;
}

function getReqIdx(order) {
  let orderMap = new Int32Array(400);
  for (let i = 0; i < 400; i++) {
    orderMap[order[i].r * 20 + order[i].c] = i;
  }
  let checks = Array.from({ length: 400 }, () => []);
  for (let tr = 0; tr < 20; tr++) {
    for (let tc = 0; tc < 20; tc++) {
      let maxIdx = -1;
      let rMin = Math.max(0, tr - 5), rMax = Math.min(19, tr + 5);
      let cMin = Math.max(0, tc - 5), cMax = Math.min(19, tc + 5);
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          let idx = orderMap[r * 20 + c];
          if (idx > maxIdx) maxIdx = idx;
        }
      }
      checks[maxIdx].push({ tr, tc });
    }
  }
  return checks;
}

function popCount(diff) {
  let d = 0;
  let t = diff;
  while (t !== 0) {
    if (t & 1) d++;
    t >>>= 1;
  }
  return d;
}

function getHamming(simGrid, target) {
  let d = 0;
  for (let r = 0; r < 20; r++) {
    d += popCount(simGrid[r] ^ target[r]);
  }
  return d;
}

function parseGrid(text) {
  let grid = new Int32Array(20);
  let lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  for (let r = 0; r < 20 && r < lines.length; r++) {
    let line = lines[r].trim();
    for (let c = 0; c < 20 && c < line.length; c++) {
      let char = line[c];
      if (char === '1' || char === 'O' || char === '*' || char === '#') {
        grid[r] |= (1 << c);
      }
    }
  }
  return grid;
}

function formatGrid(grid) {
  let res = [];
  for (let r = 0; r < 20; r++) {
    let line = '';
    for (let c = 0; c < 20; c++) {
      line += ((grid[r] >> c) & 1) ? '1' : '0';
    }
    res.push(line);
  }
  return res.join('\n');
}

let bestDist = 401;
let bestGrid = new Int32Array(20);
let timeLimit = 0;
let callCount = 0;

function checkState(depth, grid, ctx) {
  let toCheck = ctx.checks[depth - 1];
  if (toCheck.length === 0) return true;
  
  let simGrid = simulate5(grid);
  
  let hd = getHamming(simGrid, ctx.target);
  if (hd < bestDist) {
    bestDist = hd;
    for (let r = 0; r < 20; r++) bestGrid[r] = grid[r];
  }

  for (let cell of toCheck) {
    let simVal = (simGrid[cell.tr] >> cell.tc) & 1;
    let tgtVal = (ctx.target[cell.tr] >> cell.tc) & 1;
    if (simVal !== tgtVal) return false;
  }
  
  return true;
}

function solve(depth, grid, ctx) {
  if ((++callCount & 1023) === 0 && Date.now() > timeLimit) return true;
  
  if (depth > 0 && !checkState(depth, grid, ctx)) return false;

  if (depth === 400) {
    bestDist = 0;
    for (let r = 0; r < 20; r++) bestGrid[r] = grid[r];
    return true; 
  }

  let cell = ctx.order[depth];
  
  if (solve(depth + 1, grid, ctx)) return true;

  grid[cell.r] |= (1 << cell.c);
  if (solve(depth + 1, grid, ctx)) return true;
  grid[cell.r] &= ~(1 << cell.c);

  return false;
}

function main() {
  timeLimit = Date.now() + 29500;
  let text = '';
  try {
    text = fs.readFileSync('target_grid.txt', 'utf8');
  } catch (e) {
    console.error("target_grid.txt non trouvé. Utilisation d'une grille vide.");
  }
  let targetGrid = parseGrid(text);
  let order = getSpiralOrder();
  let checks = getReqIdx(order);
  
  let ctx = { target: targetGrid, order, checks };
  let grid = new Int32Array(20);
  
  solve(0, grid, ctx);
  
  let outStr = formatGrid(bestGrid);
  fs.writeFileSync('gen0_backtrack_v2.txt', outStr);
  console.log(`Terminé. Meilleure distance de Hamming : ${bestDist}`);
}

main();
