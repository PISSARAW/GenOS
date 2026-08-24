import fs from 'node:fs';

// T1
const t1 = JSON.parse(fs.readFileSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t1-mod-chain/data.json'));
let x = BigInt(t1.init);
const M = BigInt(t1.modulus);
const modExp = (b, e, m) => {
  let res = 1n; b = b % m; e = BigInt(e);
  while (e > 0n) {
    if (e % 2n === 1n) res = (res * b) % m;
    b = (b * b) % m; e /= 2n;
  }
  return res;
};
let after4 = "0";
t1.stages.forEach((st, i) => {
  const E = BigInt(st[0]); const K = BigInt(st[1]);
  x = (modExp(x, E, M) * K) % M;
  if (i === 3) after4 = x.toString();
});
fs.mkdirSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t1-mod-chain/answers', {recursive: true});
fs.writeFileSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t1-mod-chain/answers/chain.json', JSON.stringify({"after_stage_4": after4, "final": x.toString()}));

// T2
const t2 = JSON.parse(fs.readFileSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t2-dijkstra-grid/grid.json'));
const N = t2.N;
const grid = t2.entry_costs;
const walls = new Set(t2.walls.map(w => `${w[0]},${w[1]}`));
const dist = Array(N).fill(0).map(()=>Array(N).fill(Infinity));
dist[0][0] = 0;
const pq = [{r:0,c:0,d:0}];
while(pq.length) {
  pq.sort((a,b) => a.d - b.d);
  const cur = pq.shift();
  if (cur.d > dist[cur.r][cur.c]) continue;
  [[0,1],[1,0],[0,-1],[-1,0]].forEach(([dr,dc]) => {
    const nr = cur.r+dr, nc = cur.c+dc;
    if (nr>=0&&nr<N&&nc>=0&&nc<N&&!walls.has(`${nr},${nc}`)) {
      const nd = cur.d + grid[nr][nc];
      if (nd < dist[nr][nc]) {
        dist[nr][nc] = nd;
        pq.push({r:nr,c:nc,d:nd});
      }
    }
  });
}
fs.mkdirSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t2-dijkstra-grid/answers', {recursive: true});
fs.writeFileSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t2-dijkstra-grid/answers/route.json', JSON.stringify({"optimal_cost": dist[19][19]}));

// T3
const t3 = JSON.parse(fs.readFileSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t3-path-count/obstacles.json'));
const N3 = t3.N;
const obs = new Set(t3.obstacles.map(o => `${o[0]},${o[1]}`));
const dp = Array(N3).fill(0).map(()=>Array(N3).fill(0n));
dp[0][0] = 1n;
for(let r=0;r<N3;r++){
  for(let c=0;c<N3;c++){
    if (obs.has(`${r},${c}`)) dp[r][c] = 0n;
    else {
      if (r>0) dp[r][c] += dp[r-1][c];
      if (c>0) dp[r][c] += dp[r][c-1];
    }
  }
}
fs.mkdirSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t3-path-count/answers', {recursive: true});
fs.writeFileSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t3-path-count/answers/count.json', JSON.stringify({"count": Number(dp[N3-1][N3-1])}));

// T4
fs.mkdirSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t4-underdetermined/answers', {recursive: true});
fs.writeFileSync('benchmarks/duel/peer-tasks/execution-gap-suite/tasks/t4-underdetermined/answers/trio.json', JSON.stringify({
  "U": [ { "x": 3, "y": 9, "z": 6 }, { "x": 9, "y": 3, "z": 2 } ],
  "V": { "x": 4, "y": 6, "z": 9 },
  "W": "incoherent"
}));

console.log("Execution tasks solved!");
