#!/usr/bin/env node
/* Recomputes Dijkstra optimum from grid.json and grades the submitted cost. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
let g, a;
try {
  g = JSON.parse(readFileSync(path.join(dir, 'grid.json'), 'utf8'));
  a = JSON.parse(readFileSync(path.join(dir, 'answers', 'route.json'), 'utf8'));
} catch (e) { console.log(JSON.stringify({ passed: 0, failed: 1, total: 1, score: 0, details: ['lecture impossible: ' + e.message] })); process.exit(0); }

const { N, entry_costs, walls, start, goal } = g;
const wallSet = new Set(walls.map(([r, c]) => r + ',' + c));
const dist = Array.from({ length: N }, () => Array(N).fill(Infinity));
dist[start[0]][start[1]] = 0;
const pq = [[0, ...start]];
while (pq.length) {
  pq.sort((x, y) => x[0] - y[0]);
  const [d, r, c] = pq.shift();
  if (d > dist[r][c]) continue;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= N || nc < 0 || nc >= N || wallSet.has(nr + ',' + nc)) continue;
    const nd = d + entry_costs[nr][nc];
    if (nd < dist[nr][nc]) { dist[nr][nc] = nd; pq.push([nd, nr, nc]); }
  }
}
const optimal = dist[goal[0]][goal[1]];
const ok = Number(a.optimal_cost) === optimal;
console.log(JSON.stringify({
  passed: ok ? 1 : 0, failed: ok ? 0 : 1, total: 1, score: ok ? 1 : 0,
  details: [`optimal ${a.optimal_cost} vs recalculé ${optimal} ${ok ? 'OK' : 'KO'}`]
}));
