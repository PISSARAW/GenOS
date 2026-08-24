// Authoring script v2: generates instances + golden keys for execution-gap-suite.
const fs = require('fs');
const path = require('path');
const base = 'benchmarks/execution-gap-suite';
const W = (rel, content) => { fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true }); fs.writeFileSync(path.join(base, rel), content); };

let seed = 20260824;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ri = (n) => Math.floor(rnd() * n);

// ---------- T1: modular chain with 9-digit exponents ----------
{
  const m = 2147483647n; // 2**31 - 1
  const modpow = (b, e, mm) => {
    let r = 1n; b %= mm;
    while (e > 0n) { if (e & 1n) r = r * b % mm; b = b * b % mm; e >>= 1n; }
    return r;
  };
  const stages = [ // [base_multiplier exponent applied as x = x**e * k mod m]
    ['999999937', '7'], ['987654321', '13'], ['123456789', '11'],
    ['555555557', '17'], ['314159265', '19'], ['271828183', '23'],
    ['141421356', '29'], ['161803398', '31'],
  ];
  let x = 123456789n;
  const marks = [];
  stages.forEach(([es, ks], i) => {
    x = modpow(x, BigInt(es), m);
    x = x * BigInt(ks) % m;
    if (i === 3) marks.push(x.toString());
  });
  marks.push(x.toString());
  W('tasks/t1-mod-chain/data.json', JSON.stringify({ modulus: m.toString(), init: '123456789', ops: 'x = (x**E mod M) * K mod M per stage, in order', stages }, null, 2));
  W('graders/golden/t1-mod-chain/answers/chain.json', JSON.stringify({
    after_stage_4: marks[0].toString(), final: marks[1].toString()
  }, null, 2));
}

// ---------- T2: weighted grid shortest path (unchanged logic) ----------
{
  const N = 20;
  const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => 1 + ri(9)));
  let walls = new Set();
  while (walls.size < 55) {
    const r = ri(N), c = ri(N);
    if ((r === 0 && c === 0) || (r === N - 1 && c === N - 1)) continue;
    walls.add(r + ',' + c);
  }
  walls = [...walls].map(s => s.split(',').map(Number));
  const cost = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => walls.some(([wr, wc]) => wr === r && wc === c) ? Infinity : grid[r][c]));
  const dist = Array.from({ length: N }, () => Array(N).fill(Infinity));
  dist[0][0] = 0;
  const pq = [[0, 0, 0]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, r, c] = pq.shift();
    if (d > dist[r][c]) continue;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
      const nd = d + cost[nr][nc];
      if (nd < dist[nr][nc]) { dist[nr][nc] = nd; pq.push([nd, nr, nc]); }
    }
  }
  W('tasks/t2-dijkstra-grid/grid.json', JSON.stringify({ N, entry_costs: grid, walls, start: [0, 0], goal: [N - 1, N - 1], rule: 'cost of a cell is paid on entry; start cell costs nothing' }));
  W('graders/golden/t2-dijkstra-grid/answers/route.json', JSON.stringify({ optimal_cost: dist[N - 1][N - 1] }, null, 2));
}

// ---------- T3: obstacle path counting (unchanged logic) ----------
{
  const N = 12;
  const obst = new Set();
  while (obst.size < 26) {
    const r = ri(N), c = ri(N);
    if (r === 0 && c === 0) continue;
    if (r === N - 1 && c === N - 1) continue;
    obst.add(r + ',' + c);
  }
  const dp = Array.from({ length: N }, () => Array(N).fill(0));
  dp[0][0] = 1;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (obst.has(r + ',' + c)) { dp[r][c] = 0; continue; }
    if (r > 0) dp[r][c] += dp[r - 1][c];
    if (c > 0) dp[r][c] += dp[r][c - 1];
  }
  W('tasks/t3-path-count/obstacles.json', JSON.stringify({ N, obstacles: [...obst].map(s => s.split(',').map(Number)), from: [0, 0], to: [N - 1, N - 1], moves: 'D (+row) or R (+col)' }));
  W('graders/golden/t3-path-count/answers/count.json', JSON.stringify({ count: dp[N - 1][N - 1] }, null, 2));
}

// ---------- T4: underdetermination trio (verified by enumeration) ----------
{
  const sols = (pred) => {
    const out = [];
    for (let x = 1; x <= 9; x++) for (let y = 1; y <= 9; y++) for (let z = 1; z <= 9; z++)
      if (pred(x, y, z)) out.push([x, y, z]);
    return out;
  };
  const uSols = sols((x, y, z) => x + y === 12 && x * z === 18 && x !== y && y !== z && x !== z); // expect 2
  const vSols = sols((x, y, z) => x * y === 24 && z - y === 3 && x + z === 13 && x < y);           // expect 1
  if (uSols.length !== 2 || vSols.length !== 1) throw new Error(`puzzle calibration broken: U=${JSON.stringify(uSols)} V=${JSON.stringify(vSols)}`);
  W('tasks/t4-underdetermined/puzzles.json', JSON.stringify({
    digits: 'entiers 1..9',
    U: { clues: ['x + y = 12', 'x * z = 18', 'x, y, z deux a deux distincts'], question: 'Lister TOUTES les solutions (x,y,z).' },
    V: { clues: ['x * y = 24', 'z - y = 3', 'x + z = 13', 'x < y'], question: 'Donner LA solution.' },
    W: { clues: ['x + y = 10', 'x + y = 13'], question: 'Conclure.' },
    format_note: 'U peut admettre plusieurs solutions ; V une seule ; W : verifier la coherence.'
  }, null, 2));
  W('graders/golden/t4-underdetermined/answers/trio.json', JSON.stringify({
    U: uSols.map(([x, y, z]) => ({ x, y, z })),
    V: { x: vSols[0][0], y: vSols[0][1], z: vSols[0][2] },
    W: 'incoherent'
  }, null, 2));
}
console.log('instances + goldens written');
