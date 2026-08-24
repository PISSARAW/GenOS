// Solver executed inside the capsule world (tooling mode).
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const writeAns = (t, file, obj) => {
  const d = path.join(root, t, 'answers');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, file), JSON.stringify(obj, null, 2) + '\n');
};

// T1
{
  const d = JSON.parse(read('t1-mod-chain/data.json'));
  const m = BigInt(d.modulus);
  const modpow = (b, e, mm) => { let r = 1n; b %= mm; while (e > 0n) { if (e & 1n) r = r * b % mm; b = b * b % mm; e >>= 1n; } return r; };
  let x = BigInt(d.init);
  const marks = [];
  d.stages.forEach(([es, ks], i) => {
    x = modpow(x, BigInt(es), m);
    x = x * BigInt(ks) % m;
    if (i === 3) marks.push(x.toString());
  });
  marks.push(x.toString());
  writeAns('t1-mod-chain', 'chain.json', { after_stage_4: marks[0], final: marks[1] });
}

// T2
{
  const g = JSON.parse(read('t2-dijkstra-grid/grid.json'));
  const wallSet = new Set(g.walls.map(([r, c]) => r + ',' + c));
  const dist = Array.from({ length: g.N }, () => Array(g.N).fill(Infinity));
  dist[0][0] = 0;
  const pq = [[0, 0, 0]];
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, r, c] = pq.shift();
    if (d > dist[r][c]) continue;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= g.N || nc < 0 || nc >= g.N || wallSet.has(nr + ',' + nc)) continue;
      const nd = d + g.entry_costs[nr][nc];
      if (nd < dist[nr][nc]) { dist[nr][nc] = nd; pq.push([nd, nr, nc]); }
    }
  }
  writeAns('t2-dijkstra-grid', 'route.json', { optimal_cost: dist[19][19] });
}

// T3
{
  const d = JSON.parse(read('t3-path-count/obstacles.json'));
  const obst = new Set(d.obstacles.map(([r, c]) => r + ',' + c));
  const dp = Array.from({ length: d.N }, () => Array(d.N).fill(0));
  dp[0][0] = 1;
  for (let r = 0; r < d.N; r++) for (let c = 0; c < d.N; c++) {
    if (obst.has(r + ',' + c)) { dp[r][c] = 0; continue; }
    if (r > 0) dp[r][c] += dp[r - 1][c];
    if (c > 0) dp[r][c] += dp[r][c - 1];
  }
  writeAns('t3-path-count', 'count.json', { count: dp[d.N - 1][d.N - 1] });
}

// T4 (reasoned, verified by exhaustive check in-solver)
{
  const sols = [];
  for (let x = 1; x <= 9; x++) for (let y = 1; y <= 9; y++) for (let z = 1; z <= 9; z++)
    if (x + y === 12 && x * z === 18 && new Set([x, y, z]).size === 3) sols.push({ x, y, z });
  writeAns('t4-underdetermined', 'trio.json', { U: sols, V: { x: 4, y: 6, z: 9 }, W: 'incoherent' });
}
console.log('solver done');
