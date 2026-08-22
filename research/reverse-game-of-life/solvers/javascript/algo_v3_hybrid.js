const fs = require('fs');

function nextGen(grid) {
  let next = new Int32Array(20);
  for (let r = 0; r < 20; r++) {
    let r_up = (r - 1 + 20) % 20;
    let r_dn = (r + 1) % 20;
    for (let c = 0; c < 20; c++) {
      let c_left = (c - 1 + 20) % 20;
      let c_right = (c + 1) % 20;
      
      let n = ((grid[r_up] >> c_left) & 1) +
              ((grid[r_up] >> c) & 1) +
              ((grid[r_up] >> c_right) & 1) +
              ((grid[r] >> c_left) & 1) +
              ((grid[r] >> c_right) & 1) +
              ((grid[r_dn] >> c_left) & 1) +
              ((grid[r_dn] >> c) & 1) +
              ((grid[r_dn] >> c_right) & 1);
              
      let alive = (grid[r] >> c) & 1;
      if (n === 3 || (alive && n === 2)) {
        next[r] |= (1 << c);
      }
    }
  }
  return next;
}

function simulate5(grid) {
  let g = grid;
  for (let i = 0; i < 5; i++) {
    g = nextGen(g);
  }
  return g;
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

function getHamming(g1, g2) {
  let d = 0;
  for (let r = 0; r < 20; r++) {
    d += popCount(g1[r] ^ g2[r]);
  }
  return d;
}

function parseGrid(text) {
  let grid = new Int32Array(20);
  let lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  for (let r = 0; r < 20 && r < lines.length; r++) {
    let line = lines[r].trim();
    for (let c = 0; c < 20 && c < line.length; c++) {
      if (line[c] === '1') {
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

function mutate(grid) {
  let next = new Int32Array(grid);
  let type = Math.random();
  if (type < 0.6) {
    let flips = 1 + Math.floor(Math.random() * 3);
    for(let i = 0; i < flips; i++) {
      let r = Math.floor(Math.random() * 20);
      let c = Math.floor(Math.random() * 20);
      next[r] ^= (1 << c);
    }
  } else if (type < 0.8) {
    let size = 2 + Math.floor(Math.random() * 2);
    let sr = Math.floor(Math.random() * 20);
    let sc = Math.floor(Math.random() * 20);
    for(let dy=0; dy<size; dy++){
      for(let dx=0; dx<size; dx++){
         let r = (sr+dy)%20;
         let c = (sc+dx)%20;
         next[r] ^= (1 << c);
      }
    }
  } else {
     let r1 = Math.floor(Math.random() * 20);
     let c1 = Math.floor(Math.random() * 20);
     let r2 = Math.floor(Math.random() * 20);
     let c2 = Math.floor(Math.random() * 20);
     let v1 = (next[r1] >> c1) & 1;
     let v2 = (next[r2] >> c2) & 1;
     if (v1 !== v2) {
       next[r1] ^= (1 << c1);
       next[r2] ^= (1 << c2);
     }
  }
  return next;
}

function localSearch(grid, target, currentBest) {
  let rC = Math.floor(Math.random() * 20);
  let cC = Math.floor(Math.random() * 20);
  let bestG = new Int32Array(grid);
  let bestS = currentBest;
  let imp = true;
  
  while (imp) {
    imp = false;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        let r = (rC + dy + 20) % 20;
        let c = (cC + dx + 20) % 20;
        let testG = new Int32Array(bestG);
        testG[r] ^= (1 << c);
        
        let sim = simulate5(testG);
        let s = getHamming(sim, target);
        
        if (s < bestS) {
          bestS = s;
          bestG = testG;
          imp = true;
        }
      }
    }
  }
  return { grid: bestG, score: bestS };
}

function main() {
  let text = fs.readFileSync('data/target_grid.txt', 'utf8');
  let target = parseGrid(text);
  
  let currentGrid = new Int32Array(20);
  for(let r=0; r<20; r++) {
    for(let c=0; c<20; c++) {
      if (Math.random() < 0.5) currentGrid[r] |= (1<<c);
    }
  }
  
  let currentSim = simulate5(currentGrid);
  let currentScore = getHamming(currentSim, target);
  
  let bestGrid = new Int32Array(currentGrid);
  let bestScore = currentScore;
  
  let T = 20.0;
  let T_min = 0.0001;
  let alpha = 0.999995;
  
  let startTime = Date.now();
  let timeLimit = startTime + 30000;
  
  let iter = 0;
  let stagnation = 0;
  let useHybrid = true;
  
  while (Date.now() < timeLimit) {
    if (bestScore === 0) break; // We found the perfect solution
    
    iter++;
    let newGrid = mutate(currentGrid);
    let newSim = simulate5(newGrid);
    let newScore = getHamming(newSim, target);
    
    let delta = newScore - currentScore;
    
    if (delta <= 0 || Math.random() < Math.exp(-delta / T)) {
      currentGrid = newGrid;
      currentScore = newScore;
      
      if (currentScore < bestScore) {
        bestScore = currentScore;
        bestGrid = new Int32Array(currentGrid);
        stagnation = 0;
      } else {
        stagnation++;
      }
    } else {
      stagnation++;
    }
    
    T = Math.max(T_min, T * alpha);
    
    if (useHybrid && stagnation > 2000) {
      let ls = localSearch(bestGrid, target, bestScore);
      if (ls.score < bestScore) {
        bestScore = ls.score;
        bestGrid = ls.grid;
        currentGrid = new Int32Array(bestGrid);
        currentScore = bestScore;
      }
      stagnation = 0;
      T = 5.0; // Reheat
    }
  }
  
  console.log(`Final best score: ${bestScore}`);
  console.log(`Iterations: ${iter}`);
  fs.writeFileSync('results/gen0_algo3_hybrid.txt', formatGrid(bestGrid));
}

main();
